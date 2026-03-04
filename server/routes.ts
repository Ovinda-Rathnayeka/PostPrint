import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import * as net from "node:net";
import { query, testConnection, authQuery, decryptAesGcm, setPosPool } from "./db";
export async function registerRoutes(app: Express): Promise<Server> {
  app.get("/api/health", async (_req: Request, res: Response) => {
    const connected = await testConnection();
    res.json({ status: connected ? "connected" : "disconnected" });
  });

  app.post("/api/login", async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: "Email and password required" });
      }

      const users = await authQuery(
        "SELECT * FROM user_android WHERE email = ? LIMIT 1",
        [email]
      );

      if (users.length === 0) {
        return res.status(401).json({ error: "Invalid email or password" });
      }

      const storedPassword = decryptAesGcm(users[0].password);
      if (storedPassword !== password) {
        return res.status(401).json({ error: "Invalid email or password" });
      }

      const user = users[0];

      if (user.active && user.active.toLowerCase() !== "yes") {
        return res.status(403).json({ error: "inactive", message: "Your account has been deactivated. Please contact your service provider for assistance." });
      }

      const dbConnectionId = user.db_connection_id;

      if (!dbConnectionId) {
        return res.status(400).json({ error: "No database connection configured for this user" });
      }

      const dbConns = await authQuery(
        "SELECT * FROM db_connection WHERE id = ? LIMIT 1",
        [dbConnectionId]
      );

      if (dbConns.length === 0) {
        return res.status(400).json({ error: "Database connection not found" });
      }

      const dbConn = dbConns[0];
      const dbHost = decryptAesGcm(dbConn.ip_address);
      const dbUser = decryptAesGcm(dbConn.username);
      const dbPass = decryptAesGcm(dbConn.password);
      const dbName = decryptAesGcm(dbConn.database_name);
      const dbPort = dbConn.port ? parseInt(decryptAesGcm(dbConn.port)) || 3306 : 3306;

      console.log(`Setting up POS DB connection: ${dbHost}:${dbPort} / ${dbName} (user: ${dbUser})`);

      setPosPool(dbHost, dbPort, dbUser, dbPass, dbName);

      const connected = await testConnection();
      if (!connected) {
        return res.status(500).json({ error: "Could not connect to POS database" });
      }

      return res.json({
        id: user.id,
        username: user.firstname || user.email,
        name: user.firstname || user.email,
        title: "Cashier",
        post: "cashier",
        branch: "1",
        userType: "user",
        email: user.email,
      });
    } catch (error: any) {
      console.error("Login error:", error);
      return res.status(500).json({ error: "Login failed: " + (error.message || "Please try again.") });
    }
  });

  app.get("/api/service-charge", async (_req: Request, res: Response) => {
    try {
      const rows = await query(
        "SELECT precentage_value FROM vat_type WHERE vat_type = 'service_charge' LIMIT 1"
      );
      let percentage = rows.length > 0 ? parseFloat(rows[0].precentage_value) || 10 : 10;
      if (percentage > 100) percentage = percentage - 100;
      return res.json({ percentage });
    } catch (error: any) {
      console.error("Service charge error:", error);
      return res.json({ percentage: 10 });
    }
  });

  app.get("/api/categories", async (_req: Request, res: Response) => {
    try {
      const rows = await query(
        "SELECT id, catcode, category as catname FROM menu_category WHERE active = 'yes' ORDER BY catorder"
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
      let sql = "SELECT menucode, menuname, mprice as sellingprice, costprice, menucat as category, menucat1 as catcode FROM menu_master WHERE active = 'yes'";
      const params: any[] = [];

      if (category && category !== "all") {
        sql += " AND menucat = ?";
        params.push(category);
      }
      if (search) {
        sql += " AND menuname LIKE ?";
        params.push(`%${search}%`);
      }
      sql += " ORDER BY menuname";

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
      const { items, total, discount, discountRate, serviceCharge, paytype, cash, card, cardRef, bankName, userId, branch, customer } = req.body;

      const lastBillResult = await query(
        "SELECT billNo FROM nista_bill_summary WHERE billNo LIKE 'CT%' ORDER BY CAST(SUBSTRING(billNo, 3) AS UNSIGNED) DESC LIMIT 1"
      );

      let billno = "CT1001";
      if (lastBillResult.length > 0 && lastBillResult[0].billNo) {
        const lastBill = lastBillResult[0].billNo;
        const num = parseInt(lastBill.substring(2)) + 1;
        billno = "CT" + num;
      }

      const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Colombo" }));
      const pad = (n: number) => String(n).padStart(2, '0');
      const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
      const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
      const dateStr = `${todayStr} ${timeStr}`;

      let scPercent = 10;
      try {
        const scRows = await query("SELECT precentage_value FROM vat_type WHERE vat_type = 'service_charge' LIMIT 1");
        if (scRows.length > 0) {
          const rawSc = parseFloat(scRows[0].precentage_value) || 10;
          scPercent = rawSc > 100 ? rawSc - 100 : rawSc;
        }
      } catch (_e) {}
      const sc = serviceCharge ? (total * scPercent) / 100 : 0;
      const grandTotal = total + sc - discount;
      const cus = customer || "counter";
      const bal = paytype === "Cash" ? (cash - grandTotal) : 0;

      for (const item of items) {
        const amount = item.price * item.qty;
        await query(
          "INSERT INTO nista_bill_master (billno, billdate, icode, iname, logBranch, warehouse, quantity, uprice, amount, total, addAll, logUser, printok, customer, paytype, room_number, invoiceType, cm, sauce, kotno, billTime) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'yes', ?, 'no', ?, ?, '', 'inhouse', '', '', '', ?)",
          [billno, todayStr, item.code, item.name, branch, branch, item.qty, item.price, amount, amount, userId, cus, paytype, dateStr]
        );

        try {
          const menuInfo = await query(
            "SELECT menucode, menuname, costprice, itemid, quantity FROM menu_master WHERE menucode = ?",
            [item.code]
          );
          if (menuInfo.length > 0 && menuInfo[0].itemid) {
            const menuItemCode = menuInfo[0].itemid;
            const menuItemQty = menuInfo[0].quantity || 1;

            const itemCheck = await query(
              "SELECT id, statuss FROM item WHERE id = ? AND active = 'yes'",
              [menuItemCode]
            );

            if (itemCheck.length > 0 && itemCheck[0].statuss === 'ditem') {
              let remaining = item.qty * menuItemQty;

              const stocks = await query(
                "SELECT sm.availableqty, sm.id, ns.stUnitPrice FROM stock_master sm LEFT JOIN nista_stock ns ON sm.itemid = ns.stItemid AND sm.grnno = ns.stGRNNo WHERE sm.itemid = ? AND sm.availableqty > 0 ORDER BY sm.id",
                [menuItemCode]
              );

              for (const stock of stocks) {
                if (remaining <= 0) break;
                const stockId = stock.id;
                const availQty = parseFloat(stock.availableqty);
                const unitPrice = parseFloat(stock.stUnitPrice) || 0;

                if (remaining > availQty) {
                  const costamount = availQty * unitPrice;
                  await query("UPDATE stock_master SET availableqty = 0 WHERE id = ?", [stockId]);
                  await query(
                    "INSERT INTO nista_pay_voucher (branch, No, billDate, accName, accCode, DrCr, amount, payStatus, logTime, addAll, logUser, section, payType, itemname, itemcode, company, wareHouse, invotype) VALUES (?, ?, ?, 'cost of sales A/C', 'costsales', 'Dr', ?, 'yes', ?, 'yes', ?, 'in', 'Cash', ?, ?, ?, ?, 'inhouse')",
                    [branch, billno, todayStr, costamount, dateStr, userId, item.name, item.code, cus, branch]
                  );
                  await query(
                    "INSERT INTO nista_pay_voucher (branch, No, billDate, accName, accCode, DrCr, amount, payStatus, logTime, addAll, logUser, section, payType, itemname, itemcode, company, wareHouse, invotype) VALUES (?, ?, ?, 'inventoryA/c', 'invent', 'Cr', ?, 'yes', ?, 'yes', ?, 'in', 'Cash', ?, ?, ?, ?, 'inhouse')",
                    [branch, billno, todayStr, costamount, dateStr, userId, item.name, item.code, cus, branch]
                  );
                  remaining -= availQty;
                } else {
                  const newRemaining = availQty - remaining;
                  const costamount = remaining * unitPrice;
                  await query("UPDATE stock_master SET availableqty = ? WHERE id = ?", [newRemaining, stockId]);
                  await query(
                    "INSERT INTO nista_pay_voucher (branch, No, billDate, accName, accCode, DrCr, amount, payStatus, logTime, addAll, logUser, section, payType, itemname, itemcode, company, wareHouse, invotype) VALUES (?, ?, ?, 'cost of sales A/C', 'costsales', 'Dr', ?, 'yes', ?, 'yes', ?, 'in', 'Cash', ?, ?, ?, ?, 'inhouse')",
                    [branch, billno, todayStr, costamount, dateStr, userId, item.name, item.code, cus, branch]
                  );
                  await query(
                    "INSERT INTO nista_pay_voucher (branch, No, billDate, accName, accCode, DrCr, amount, payStatus, logTime, addAll, logUser, section, payType, itemname, itemcode, company, wareHouse, invotype) VALUES (?, ?, ?, 'inventoryA/c', 'invent', 'Cr', ?, 'yes', ?, 'yes', ?, 'in', 'Cash', ?, ?, ?, ?, 'inhouse')",
                    [branch, billno, todayStr, costamount, dateStr, userId, item.name, item.code, cus, branch]
                  );
                  remaining = 0;
                  break;
                }
              }
            }
          }
        } catch (stockErr) {
          console.error("Stock update error (non-fatal):", stockErr);
        }

        try {
          const menuItems = await query(
            "SELECT mi.item_id, mi.item_quantity, mi.item_name FROM menu_items mi WHERE mi.menucode = ?",
            [item.code]
          );
          for (const mi of menuItems) {
            const quan = (mi.item_quantity || 1) * item.qty;
            const existing = await query(
              "SELECT id, item_qty FROM item_quantity_sale_new WHERE item_id = ? AND date = ?",
              [mi.item_id, todayStr]
            );
            if (existing.length > 0) {
              const newQty = parseFloat(existing[0].item_qty) + quan;
              await query("UPDATE item_quantity_sale_new SET item_qty = ? WHERE id = ?", [newQty, existing[0].id]);
            } else {
              await query(
                "INSERT INTO item_quantity_sale_new (item_name, menu_code, item_qty, item_id, inv_num, date, time) VALUES (?, ?, ?, ?, ?, ?, ?)",
                [mi.item_name || '', item.code, quan, mi.item_id, billno, todayStr, timeStr]
              );
            }
          }
        } catch (itemQtyErr) {
          console.error("Item quantity sale tracking error (non-fatal):", itemQtyErr);
        }
      }

      const discPerVal = discountRate || 0;
      await query(
        "INSERT INTO nista_bill_summary (billNo, billDate, amount, discount, subTotal, billTime, user, printOk, customer, paytype, status, paybalense, vat, nbt, branch, servicecharge, disctype, discper, servitype, serviper, invoiceType, dilivery, malTime, slTime, machTime, creditrefno) VALUES (?, ?, ?, ?, ?, ?, ?, 'no', ?, ?, '', ?, '', '0.00', ?, ?, '', '', 'no', '0', 'inhouse', 'no', ?, ?, ?, ?)",
        [billno, dateStr, total, discount, grandTotal, timeStr, userId, cus, paytype, bal, branch, sc, dateStr, dateStr, dateStr, cardRef || ""]
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
        [branch, branch, billno, dateStr, total, timeStr, userId, cus]
      );

      try {
        await query(
          "INSERT INTO nista_pay_voucher (wareHouse, No, billDate, description, accName, accCode, DrCr, amount, payAmount, payStatus, logTime, addAll, logUser, section, salesref, company, agrementno, payType, chequeNo, chequeDate, grnNo, grnstatus, billno, invoNo, invotype, itemname, itemcode, logDate, branch, user, card_reference_no, room_number, center) VALUES (?, ?, ?, '', 'Service Charge', 'sca', 'CR', ?, '', '', ?, '', ?, 'invoice', '', '', '', '', '', '', '', '', ?, ?, 'online', '', '', ?, ?, ?, '', '', '')",
          [branch, billno, todayStr, sc, dateStr, userId, billno, billno, todayStr, branch, userId]
        );
      } catch (scVoucherErr) {
        console.error("Service charge voucher error (non-fatal):", scVoucherErr);
      }

      try {
        const debtorAmt = serviceCharge ? grandTotal : total;
        await query(
          "INSERT INTO nista_pay_voucher (wareHouse, No, billDate, description, accName, accCode, DrCr, amount, payAmount, payStatus, logTime, addAll, logUser, section, salesref, company, agrementno, payType, chequeNo, chequeDate, grnNo, grnstatus, billno, invoNo, invotype, itemname, itemcode, logDate, branch, user, card_reference_no, room_number, center) VALUES (?, ?, ?, '', 'Debter control Account', 'DB1', 'DR', ?, '', '', ?, '', ?, 'invoice', '', '', '', '', '', '', '', '', ?, ?, 'table', '', '', ?, ?, ?, '', '', '')",
          [branch, billno, todayStr, grandTotal, dateStr, userId, billno, billno, todayStr, branch, userId]
        );
      } catch (debtorErr) {
        console.error("Debtor voucher error (non-fatal):", debtorErr);
      }

      if (paytype === "Card") {
        await query(
          "INSERT INTO nista_pay_voucher (branch, wareHouse, No, billDate, accName, accCode, DrCr, amount, payAmount, payStatus, logTime, addAll, logUser, section, payType, company, invotype, card_reference_no) VALUES (?, ?, ?, ?, 'Card Account', 'creditCard', 'Dr', ?, ?, 'yes', ?, 'yes', ?, 'in', 'Card', ?, 'inhouse', ?)",
          [branch, branch, billno, dateStr, total, card || grandTotal, timeStr, userId, cus, cardRef || ""]
        );

        try {
          await query(
            "INSERT INTO monycolection (colectiondate, jobno, jobtype, cash, card, cardref, cheq, chqno, chqdate, invoiceno, paybyshop, creditamount, invotype, tot, cash_re, balance) VALUES (?, '', '', '', ?, ?, '', '', '', ?, '', '', 'counter', ?, '', ?)",
            [todayStr, card || grandTotal, cardRef || "", billno, card || grandTotal, bal]
          );
        } catch (moneyErr) {
          console.error("Money collection error (non-fatal):", moneyErr);
        }
      } else if (paytype === "Cash") {
        await query(
          "INSERT INTO nista_pay_voucher (branch, wareHouse, No, billDate, accName, accCode, DrCr, amount, payAmount, payStatus, logTime, addAll, logUser, section, payType, company, invotype, card_reference_no) VALUES (?, ?, ?, ?, 'Cash in hand', 'Cas1', 'Dr', ?, ?, 'yes', ?, 'yes', ?, 'in', 'cash', ?, 'inhouse', '')",
          [branch, branch, billno, dateStr, total, cash || grandTotal, timeStr, userId, cus]
        );

        try {
          await query(
            "INSERT INTO monycolection (colectiondate, jobno, jobtype, cash, card, cardref, cheq, chqno, chqdate, invoiceno, paybyshop, creditamount, invotype, tot, cash_re, balance) VALUES (?, '', '', ?, '', '', '', '', '', ?, '', '', 'online', ?, '', ?)",
            [todayStr, cash || grandTotal, billno, cash || grandTotal, bal]
          );
        } catch (moneyErr) {
          console.error("Money collection error (non-fatal):", moneyErr);
        }
      } else if (paytype === "CardandCash") {
        await query(
          "INSERT INTO nista_pay_voucher (branch, wareHouse, No, billDate, accName, accCode, DrCr, amount, payAmount, payStatus, logTime, addAll, logUser, section, payType, company, invotype, card_reference_no) VALUES (?, ?, ?, ?, 'Cash in hand', 'Cas1', 'Dr', ?, ?, 'yes', ?, 'yes', ?, 'in', 'cash', ?, 'inhouse', '')",
          [branch, branch, billno, todayStr, total, cash || 0, timeStr, userId, cus]
        );

        await query(
          "INSERT INTO nista_pay_voucher (branch, wareHouse, No, billDate, accName, accCode, DrCr, amount, payAmount, payStatus, logTime, addAll, logUser, section, payType, company, invotype, card_reference_no) VALUES (?, ?, ?, ?, 'Card Account', 'creditCard', 'Dr', ?, ?, 'yes', ?, 'yes', ?, 'in', 'Card', ?, 'inhouse', ?)",
          [branch, branch, billno, dateStr, total, card || 0, timeStr, userId, cus, cardRef || ""]
        );

        try {
          await query(
            "INSERT INTO monycolection (colectiondate, jobno, jobtype, cash, card, cardref, cheq, chqno, chqdate, invoiceno, paybyshop, creditamount, invotype, tot, cash_re, balance) VALUES (?, '', '', ?, ?, ?, '', '', '', ?, '', '', 'counter', ?, '', ?)",
            [todayStr, cash || 0, card || 0, cardRef || "", billno, total, bal]
          );
        } catch (moneyErr) {
          console.error("Money collection error (non-fatal):", moneyErr);
        }
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
        const payable = total - discount;

        await query(
          "INSERT INTO recipt (branch, reciptno, amount, payType, payment, reciptDate, user, status, customer, type, invoiceno) VALUES (?, ?, ?, ?, ?, ?, ?, 'ok', ?, 'Restaurant', ?)",
          [branch, receiptNo, payable, paytype, payable, dateStr, userId, cus, billno]
        );

        try {
          await query(
            "INSERT INTO deposit_recipt (billName, billNo, branch, reserve_no, reciptno, reciptDate, customer, amount, payment, user, sign) VALUES ('invoice', ?, ?, '', ?, ?, ?, ?, ?, ?, 'yes')",
            [billno, branch, receiptNo, dateStr, cus, payable, payable, userId]
          );
        } catch (depositErr) {
          console.error("Deposit receipt error (non-fatal):", depositErr);
        }
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

  app.get("/api/invoice-data/:billNo", async (req: Request, res: Response) => {
    try {
      const { billNo } = req.params;
      const branch = (req.query.branch as string) || "1";
      const username = (req.query.username as string) || "admin";

      const companyRows = await query(
        "SELECT * FROM companydetails WHERE branchId = ? LIMIT 1",
        [branch]
      );
      const company = companyRows.length > 0 ? companyRows[0] : {};

      const branchRows = await query(
        "SELECT branchname FROM branch WHERE id = ? LIMIT 1",
        [branch]
      );
      const branchName = branchRows.length > 0 ? branchRows[0].branchname : "";

      const summaryRows = await query(
        "SELECT * FROM nista_bill_summary WHERE billNo = ? LIMIT 1",
        [billNo]
      );
      const invoice = summaryRows.length > 0 ? summaryRows[0] : null;
      if (!invoice) {
        return res.status(404).json({ error: "Invoice not found" });
      }

      const itemRows = await query(
        "SELECT nbm.quantity, nbm.uprice, nbm.amount, nbm.icode, mm.menuname, mm.menucode FROM nista_bill_master nbm LEFT JOIN menu_master mm ON nbm.icode = mm.menucode WHERE nbm.billno = ?",
        [billNo]
      );

      const items = itemRows.map((row: any) => ({
        name: row.menuname || "",
        qty: String(row.quantity),
        price: String(row.uprice),
        amt: String(row.amount),
      }));

      const payment = parseFloat(invoice.subTotal) + parseFloat(invoice.paybalense || 0);

      const invoiceData = {
        company: {
          name: company.company || "",
          address: company.adress || "",
          email: company.email || "",
          phone: company.tp || "",
          branch: branchName,
        },
        invoice: {
          id: billNo,
          date: invoice.billDate || "",
          time: invoice.billTime || "",
          orderNo: invoice.jobno || "",
          cashier: username,
        },
        items,
        summary: {
          subTotal: String(invoice.amount || "0.00"),
          serviceCharge: String(invoice.servicecharge || "0.00"),
          discount: String(invoice.discount || "0.00"),
          nbt: String(invoice.nbt || "0.00"),
          vat: String(invoice.vat || "0.00"),
          delivery: invoice.dilivery || "no",
          grandTotal: String(invoice.subTotal || "0.00"),
          payment: String(payment),
          balance: String(invoice.paybalense || "0.00"),
        },
        footer: {
          message: "Thank you. Come again !!!",
          software: "Software By MyBiz.lk +94 777721122",
        },
      };

      return res.json(invoiceData);
    } catch (error: any) {
      console.error("Invoice data error:", error);
      return res.status(500).json({ error: "Failed to fetch invoice data" });
    }
  });

  app.get("/api/orders", async (req: Request, res: Response) => {
    try {
      const { branch, date } = req.query;
      const sriLankaNow = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Colombo" }));
      const slPad = (n: number) => String(n).padStart(2, '0');
      const dateFilter = date || `${sriLankaNow.getFullYear()}-${slPad(sriLankaNow.getMonth() + 1)}-${slPad(sriLankaNow.getDate())}`;
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
      const sriLankaNow = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Colombo" }));
      const slPad = (n: number) => String(n).padStart(2, '0');
      const dateFilter = date || `${sriLankaNow.getFullYear()}-${slPad(sriLankaNow.getMonth() + 1)}-${slPad(sriLankaNow.getDate())}`;
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

  function buildEscPosReceipt(data: any): Buffer {
    const ESC = 0x1B;
    const GS = 0x1D;
    const LF = 0x0A;
    const cmds: number[] = [];

    const addBytes = (...bytes: number[]) => bytes.forEach(b => cmds.push(b));
    const addText = (text: string) => {
      for (let i = 0; i < text.length; i++) cmds.push(text.charCodeAt(i));
    };
    const newLine = () => addBytes(LF);
    const centerOn = () => addBytes(ESC, 0x61, 1);
    const leftAlign = () => addBytes(ESC, 0x61, 0);
    const rightAlign = () => addBytes(ESC, 0x61, 2);
    const boldOn = () => addBytes(ESC, 0x45, 1);
    const boldOff = () => addBytes(ESC, 0x45, 0);
    const doubleSize = () => addBytes(GS, 0x21, 0x11);
    const normalSize = () => addBytes(GS, 0x21, 0x00);
    const cutPaper = () => addBytes(GS, 0x56, 0x00);

    const addLine = (text: string) => { addText(text); newLine(); };
    const COLS = 48;
    const divider = "=".repeat(COLS);
    const thinDivider = "-".repeat(COLS);

    const padRight = (s: string, len: number) => s.length >= len ? s.substring(0, len) : s + " ".repeat(len - s.length);
    const padLeft = (s: string, len: number) => s.length >= len ? s.substring(0, len) : " ".repeat(len - s.length) + s;

    const c = data.company || {};
    const inv = data.invoice || {};
    const items = data.items || [];
    const s = data.summary || {};
    const f = data.footer || {};

    addBytes(ESC, 0x40);

    centerOn();
    doubleSize();
    boldOn();
    addLine(c.name || "");
    normalSize();
    boldOff();
    if (c.address) addLine(c.address);
    if (c.email) addLine(c.email);
    if (c.phone) addLine(`Tel : ${c.phone}`);
    addLine(divider);

    leftAlign();
    addLine(`Outlet       : ${c.branch || ""}`);
    addLine(`Invoice No   : ${inv.id || ""}`);
    addLine(`Invoice Date : ${inv.date || ""} ${inv.time || ""}`);
    addLine(`Cashier      : ${inv.cashier || ""}`);

    centerOn();
    addLine(thinDivider);

    leftAlign();
    for (const item of items) {
      const name = item.name || "Item";
      const qty = (item.qty || "0").padStart(5);
      const price = (item.price || "0").padStart(10);
      const amt = (item.amt || "0.00").padStart(12);
      addLine(name);
      addLine(`                ${qty} ${price}  ${amt}`);
    }

    centerOn();
    addLine(thinDivider);

    rightAlign();
    addLine(`Sub Total (LKR) :      ${s.subTotal || "0.00"}`);
    const scVal = parseFloat(s.serviceCharge || "0");
    if (scVal > 0) addLine(`Service Charge  :      ${scVal.toFixed(2)}`);
    const discVal = parseFloat(s.discount || "0");
    if (discVal > 0) addLine(`Discount        :     -${discVal.toFixed(2)}`);
    boldOn();
    addLine(`Grand Total (LKR) :      ${s.grandTotal || "0.00"}`);
    boldOff();
    addLine(`Payment (LKR) :      ${s.payment || "0.00"}`);
    const balVal = parseFloat(s.balance || "0");
    if (balVal > 0) addLine(`Balance (LKR) :      ${balVal.toFixed(2)}`);

    centerOn();
    addLine(thinDivider);
    addLine(f.message || "Thank you, come again !!!");
    normalSize();
    addLine(f.software || "");

    newLine(); newLine(); newLine(); newLine();
    cutPaper();

    return Buffer.from(cmds);
  }

  function sendToPrinter(printerIp: string, printerPort: number, data: Buffer): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = new net.Socket();
      socket.setTimeout(5000);
      socket.connect(printerPort, printerIp, () => {
        socket.write(data, () => {
          socket.end();
          resolve();
        });
      });
      socket.on("error", (err) => {
        socket.destroy();
        reject(err);
      });
      socket.on("timeout", () => {
        socket.destroy();
        reject(new Error("Printer connection timeout"));
      });
    });
  }

  app.post("/api/print-receipt", async (req: Request, res: Response) => {
    try {
      const { billNo, branch, username } = req.body;
      if (!billNo) return res.status(400).json({ error: "billNo required" });

      const printerIp = process.env.PRINTER_IP;
      const printerPort = parseInt(process.env.PRINTER_PORT || "9100");
      if (!printerIp) return res.status(400).json({ error: "PRINTER_IP not configured" });

      const companyRows = await query(
        "SELECT * FROM companydetails WHERE branchId = ? LIMIT 1",
        [branch || "1"]
      );
      const company = companyRows.length > 0 ? companyRows[0] : {};

      const branchRows = await query(
        "SELECT branchname FROM branch WHERE id = ? LIMIT 1",
        [branch || "1"]
      );
      const branchName = branchRows.length > 0 ? branchRows[0].branchname : "";

      const summaryRows = await query(
        "SELECT * FROM nista_bill_summary WHERE billNo = ? LIMIT 1",
        [billNo]
      );
      const invoice = summaryRows.length > 0 ? summaryRows[0] : null;
      if (!invoice) return res.status(404).json({ error: "Invoice not found" });

      const itemRows = await query(
        "SELECT nbm.quantity, nbm.uprice, nbm.amount, nbm.icode, mm.menuname FROM nista_bill_master nbm LEFT JOIN menu_master mm ON nbm.icode = mm.menucode WHERE nbm.billno = ? GROUP BY mm.menucode",
        [billNo]
      );

      const items = itemRows.map((row: any) => ({
        name: row.menuname || "",
        qty: String(row.quantity),
        price: String(row.uprice),
        amt: String(row.amount),
      }));

      const payment = parseFloat(invoice.subTotal) + parseFloat(invoice.paybalense || 0);

      const invoiceData = {
        company: {
          name: company.company || "",
          address: company.adress || "",
          email: company.email || "",
          phone: company.tp || "",
          branch: branchName,
        },
        invoice: {
          id: billNo,
          date: invoice.billDate || "",
          time: invoice.billTime || "",
          cashier: username || "admin",
        },
        items,
        summary: {
          subTotal: String(invoice.amount || "0.00"),
          serviceCharge: String(invoice.servicecharge || "0.00"),
          discount: String(invoice.discount || "0.00"),
          grandTotal: String(invoice.subTotal || "0.00"),
          payment: String(payment),
          balance: String(invoice.paybalense || "0.00"),
        },
        footer: {
          message: "Thank you, come again !!!",
          software: "Software By MyBiz.lk +94 777721122",
        },
      };

      const receiptData = buildEscPosReceipt(invoiceData);
      await sendToPrinter(printerIp, printerPort, receiptData);

      return res.json({ success: true, message: "Receipt printed" });
    } catch (error: any) {
      console.error("Print error:", error);
      return res.status(500).json({ error: "Print failed: " + (error.message || "Unknown error") });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
