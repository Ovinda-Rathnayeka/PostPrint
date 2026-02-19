import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import { query, testConnection } from "./db";

export async function registerRoutes(app: Express): Promise<Server> {
  app.get("/api/health", async (_req: Request, res: Response) => {
    const connected = await testConnection();
    res.json({ status: connected ? "connected" : "disconnected" });
  });

  app.post("/api/login", async (req: Request, res: Response) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ error: "Username and password required" });
      }
      if (username === "admin" && password === "admin") {
        return res.json({
          id: 1,
          username: "admin",
          name: "Admin",
          title: "Administrator",
          post: "admin",
          branch: "1",
          userType: "admin",
        });
      }
      return res.status(401).json({ error: "Invalid credentials" });
    } catch (error: any) {
      console.error("Login error:", error);
      return res.status(500).json({ error: "Login failed. Please try again." });
    }
  });

  app.get("/api/categories", async (_req: Request, res: Response) => {
    try {
      const rows = await query(
        "SELECT id, catcode, catname FROM menu_category WHERE active = 'yes' ORDER BY catname"
      );
      return res.json(rows);
    } catch (error: any) {
      console.error("Categories error:", error);
      return res.status(500).json({ error: "Failed to fetch categories" });
    }
  });

  app.get("/api/menu-items", async (req: Request, res: Response) => {
    try {
      const { category, search } = req.query;
      let sql = "SELECT mm.menucode, mm.menuname, mm.sellingprice, mm.costprice, mm.category, mc.catname FROM menu_master mm LEFT JOIN menu_category mc ON mm.category = mc.catcode WHERE mm.active = 'yes'";
      const params: any[] = [];

      if (category && category !== "all") {
        sql += " AND mm.category = ?";
        params.push(category);
      }
      if (search) {
        sql += " AND mm.menuname LIKE ?";
        params.push(`%${search}%`);
      }
      sql += " ORDER BY mm.menuname";

      const rows = await query(sql, params);
      return res.json(rows);
    } catch (error: any) {
      console.error("Menu items error:", error);
      return res.status(500).json({ error: "Failed to fetch menu items" });
    }
  });

  app.get("/api/company-details", async (req: Request, res: Response) => {
    try {
      const { branch } = req.query;
      const rows = await query(
        "SELECT * FROM companydetails WHERE branchId = ? LIMIT 1",
        [branch || "1"]
      );
      if (rows.length === 0) {
        return res.json(null);
      }
      return res.json(rows[0]);
    } catch (error: any) {
      console.error("Company details error:", error);
      return res.status(500).json({ error: "Failed to fetch company details" });
    }
  });

  app.post("/api/place-order", async (req: Request, res: Response) => {
    try {
      const { items, total, discount, serviceCharge, paytype, cash, card, cardRef, userId, branch, customer } = req.body;

      const maxResult = await query(
        "SELECT MAX(id) as maxId FROM nista_bill_summary WHERE branch = ? AND (invoiceType='inhouse' OR invoiceType='onlineorders') AND billNo LIKE 'CT%'",
        [branch]
      );

      let billno = "CT1001";
      if (maxResult[0]?.maxId) {
        const billResult = await query(
          "SELECT billNo FROM nista_bill_summary WHERE id = ?",
          [maxResult[0].maxId]
        );
        if (billResult.length > 0) {
          const lastBill = billResult[0].billNo;
          const num = parseInt(lastBill.substring(2)) + 1;
          billno = "CT" + num;
        }
      }

      const now = new Date();
      const dateStr = now.toISOString().slice(0, 19).replace("T", " ");
      const todayStr = now.toISOString().slice(0, 10);
      const timeStr = now.toTimeString().slice(0, 8);

      const sc = serviceCharge ? (total * 10) / 100 : 0;
      const grandTotal = total + sc - discount;
      const cus = customer || "counter";
      const bal = paytype === "Cash" ? (cash - grandTotal) : 0;

      for (const item of items) {
        const amount = item.price * item.qty;
        await query(
          "INSERT INTO nista_bill_master (billno, billdate, icode, iname, logBranch, warehouse, quantity, uprice, amount, total, addAll, logUser, printok, customer, paytype, room_number, invoiceType, billTime) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'yes', ?, 'no', ?, ?, '', 'inhouse', ?)",
          [billno, todayStr, item.code, item.name, branch, branch, item.qty, item.price, amount, amount, userId, cus, paytype, dateStr]
        );

        try {
          const menuInfo = await query(
            "SELECT itemid, quantity FROM menu_master WHERE menucode = ?",
            [item.code]
          );
          if (menuInfo.length > 0 && menuInfo[0].itemid) {
            const itemId = menuInfo[0].itemid;
            const menuQty = menuInfo[0].quantity || 1;
            let remaining = item.qty * menuQty;

            const stocks = await query(
              "SELECT id, availableqty FROM stock_master WHERE itemid = ? AND availableqty > 0 ORDER BY id",
              [itemId]
            );

            for (const stock of stocks) {
              if (remaining <= 0) break;
              if (remaining >= stock.availableqty) {
                remaining -= stock.availableqty;
                await query("UPDATE stock_master SET availableqty = 0 WHERE id = ?", [stock.id]);
              } else {
                const newQty = stock.availableqty - remaining;
                await query("UPDATE stock_master SET availableqty = ? WHERE id = ?", [newQty, stock.id]);
                remaining = 0;
              }
            }
          }
        } catch (stockErr) {
          console.error("Stock update error (non-fatal):", stockErr);
        }
      }

      await query(
        "INSERT INTO nista_bill_summary (billNo, billDate, amount, discount, subTotal, billTime, user, printOk, customer, paytype, status, paybalense, vat, nbt, branch, servicecharge, disctype, discper, servitype, serviper, invoiceType, dilivery, malTime, slTime, machTime) VALUES (?, ?, ?, ?, ?, ?, ?, 'no', ?, ?, '', ?, '', '0.00', ?, ?, '', '', 'no', '0', 'inhouse', 'no', ?, ?, ?)",
        [billno, dateStr, total, discount, grandTotal, timeStr, userId, cus, paytype, bal, branch, sc, dateStr, dateStr, dateStr]
      );

      try {
        await query(
          "INSERT INTO invoicesummry (invoiceno, invoicedate, subtotal, discount, grandtot, loguser, customer, paytype, status, paybalance, vat, nbt, branch, service, billtype, logdate, delivery) VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', ?, '', '0.00', ?, ?, 'restaurant', ?, '')",
          [billno, dateStr, total, discount, grandTotal, userId, cus, paytype, bal, branch, sc, todayStr]
        );
      } catch (summaryErr) {
        console.error("Invoice summary error (non-fatal):", summaryErr);
      }

      await query(
        "INSERT INTO nista_pay_voucher (branch, wareHouse, No, billDate, accName, accCode, DrCr, amount, payStatus, logTime, addAll, logUser, section, company, invotype) VALUES (?, ?, ?, ?, 'Sales Account', 'sal1', 'Cr', ?, 'yes', ?, 'yes', ?, 'in', ?, 'inhouse')",
        [branch, branch, billno, dateStr, total, dateStr, userId, cus]
      );

      if (paytype === "Card" || paytype === "CardandCash") {
        const cardAmt = paytype === "Card" ? grandTotal : (card || 0);
        await query(
          "INSERT INTO nista_pay_voucher (branch, wareHouse, No, billDate, accName, accCode, DrCr, amount, payAmount, payStatus, logTime, addAll, logUser, section, payType, company, invotype, card_reference_no) VALUES (?, ?, ?, ?, 'Card Account', 'creditCard', 'Dr', ?, ?, 'yes', ?, 'yes', ?, 'in', 'Card', ?, 'inhouse', ?)",
          [branch, branch, billno, dateStr, grandTotal, cardAmt, dateStr, userId, cus, cardRef || ""]
        );
      }
      if (paytype === "Cash" || paytype === "CardandCash") {
        const cashAmt = paytype === "Cash" ? grandTotal : (cash || 0);
        await query(
          "INSERT INTO nista_pay_voucher (branch, wareHouse, No, billDate, accName, accCode, DrCr, amount, payAmount, payStatus, logTime, addAll, logUser, section, payType, company, invotype) VALUES (?, ?, ?, ?, 'Cash in hand', 'Cas1', 'Dr', ?, ?, 'yes', ?, 'yes', ?, 'in', 'cash', ?, 'inhouse')",
          [branch, branch, billno, dateStr, grandTotal, cashAmt, dateStr, userId, cus]
        );
      }

      try {
        const cashVal = paytype === "Cash" ? grandTotal : (paytype === "CardandCash" ? (cash || 0) : 0);
        const cardVal = paytype === "Card" ? grandTotal : (paytype === "CardandCash" ? (card || 0) : 0);
        await query(
          "INSERT INTO monycolection (colectiondate, cash, card, cardref, invoiceno, invotype, tot, balance) VALUES (?, ?, ?, ?, ?, 'counter', ?, ?)",
          [todayStr, cashVal, cardVal, cardRef || "", billno, grandTotal, bal]
        );
      } catch (moneyErr) {
        console.error("Money collection error (non-fatal):", moneyErr);
      }

      try {
        let receiptPrefix = branch === "1" ? "MR" : "CR";
        const maxReceipt = await query(
          "SELECT MAX(id) as maxId FROM recipt WHERE branch = ?",
          [branch]
        );
        let receiptNo = receiptPrefix + "1001";
        if (maxReceipt[0]?.maxId) {
          const recResult = await query(
            "SELECT reciptno FROM recipt WHERE id = ?",
            [maxReceipt[0].maxId]
          );
          if (recResult.length > 0) {
            const lastRec = recResult[0].reciptno;
            const recNum = parseInt(lastRec.substring(2)) + 1;
            receiptNo = receiptPrefix + recNum;
          }
        }
        await query(
          "INSERT INTO recipt (branch, reciptno, amount, payType, payment, reciptDate, user, status, customer, type, invoiceno) VALUES (?, ?, ?, ?, ?, ?, ?, 'ok', ?, 'Restaurant', ?)",
          [branch, receiptNo, grandTotal, paytype, grandTotal, dateStr, userId, cus, billno]
        );
      } catch (receiptErr) {
        console.error("Receipt error (non-fatal):", receiptErr);
      }

      return res.json({
        success: true,
        billNo: billno,
        total: grandTotal,
        serviceCharge: sc,
        discount,
      });
    } catch (error: any) {
      console.error("Place order error:", error);
      return res.status(500).json({ error: "Failed to place order: " + error.message });
    }
  });

  app.get("/api/orders", async (req: Request, res: Response) => {
    try {
      const { branch, date } = req.query;
      const dateFilter = date || new Date().toISOString().slice(0, 10);
      const rows = await query(
        "SELECT bs.id, bs.billNo, bs.billDate, bs.amount, bs.discount, bs.subTotal, bs.paytype, bs.customer, bs.servicecharge, bs.user FROM nista_bill_summary bs WHERE bs.branch = ? AND DATE(bs.billDate) = ? AND bs.invoiceType = 'inhouse' ORDER BY bs.id DESC",
        [branch || "1", dateFilter]
      );
      return res.json(rows);
    } catch (error: any) {
      console.error("Orders error:", error);
      return res.status(500).json({ error: "Failed to fetch orders" });
    }
  });

  app.get("/api/order-details/:billNo", async (req: Request, res: Response) => {
    try {
      const { billNo } = req.params;
      const items = await query(
        "SELECT icode, iname, quantity, uprice, amount FROM nista_bill_master WHERE billno = ? ORDER BY id",
        [billNo]
      );
      const summary = await query(
        "SELECT * FROM nista_bill_summary WHERE billNo = ? LIMIT 1",
        [billNo]
      );
      return res.json({
        items,
        summary: summary.length > 0 ? summary[0] : null,
      });
    } catch (error: any) {
      console.error("Order details error:", error);
      return res.status(500).json({ error: "Failed to fetch order details" });
    }
  });

  app.get("/api/daily-summary", async (req: Request, res: Response) => {
    try {
      const { branch, date } = req.query;
      const dateFilter = date || new Date().toISOString().slice(0, 10);
      const rows = await query(
        "SELECT COUNT(*) as totalOrders, COALESCE(SUM(subTotal), 0) as totalSales, COALESCE(SUM(discount), 0) as totalDiscount, COALESCE(SUM(servicecharge), 0) as totalServiceCharge FROM nista_bill_summary WHERE branch = ? AND DATE(billDate) = ? AND invoiceType = 'inhouse'",
        [branch || "1", dateFilter]
      );
      const cashRows = await query(
        "SELECT COALESCE(SUM(subTotal), 0) as cashTotal FROM nista_bill_summary WHERE branch = ? AND DATE(billDate) = ? AND invoiceType = 'inhouse' AND paytype = 'Cash'",
        [branch || "1", dateFilter]
      );
      const cardRows = await query(
        "SELECT COALESCE(SUM(subTotal), 0) as cardTotal FROM nista_bill_summary WHERE branch = ? AND DATE(billDate) = ? AND invoiceType = 'inhouse' AND paytype = 'Card'",
        [branch || "1", dateFilter]
      );
      return res.json({
        totalOrders: rows[0]?.totalOrders || 0,
        totalSales: parseFloat(rows[0]?.totalSales || "0"),
        totalDiscount: parseFloat(rows[0]?.totalDiscount || "0"),
        totalServiceCharge: parseFloat(rows[0]?.totalServiceCharge || "0"),
        cashTotal: parseFloat(cashRows[0]?.cashTotal || "0"),
        cardTotal: parseFloat(cardRows[0]?.cardTotal || "0"),
      });
    } catch (error: any) {
      console.error("Daily summary error:", error);
      return res.status(500).json({ error: "Failed to fetch daily summary" });
    }
  });

  app.post("/api/test-connection", async (req: Request, res: Response) => {
    try {
      const connected = await testConnection();
      if (connected) {
        return res.json({ success: true, message: "Connected to MySQL successfully" });
      }
      return res.status(500).json({ success: false, message: "Failed to connect to MySQL" });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  });

  app.get("/api/customers", async (_req: Request, res: Response) => {
    try {
      const rows = await query(
        "SELECT id, name, mobile, address FROM customer WHERE active = 'yes' ORDER BY name LIMIT 100"
      );
      return res.json(rows);
    } catch (error: any) {
      console.error("Customers error:", error);
      return res.status(500).json({ error: "Failed to fetch customers" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
