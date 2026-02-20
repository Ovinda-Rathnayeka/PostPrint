import * as net from "node:net";

const ESC = "\x1B";
const GS = "\x1D";
const LF = "\x0A";

const CMD = {
  INIT: ESC + "@",
  ALIGN_LEFT: ESC + "a\x00",
  ALIGN_CENTER: ESC + "a\x01",
  ALIGN_RIGHT: ESC + "a\x02",
  BOLD_ON: ESC + "E\x01",
  BOLD_OFF: ESC + "E\x00",
  FONT_BIG: GS + "!\x11",
  FONT_NORMAL: GS + "!\x00",
  FONT_SMALL: ESC + "M\x01",
  FONT_DEFAULT: ESC + "M\x00",
  CUT: GS + "V\x01",
  FEED: ESC + "d\x04",
};

function padRight(text: string, width: number): string {
  return text.length >= width ? text.slice(0, width) : text + " ".repeat(width - text.length);
}

function padLeft(text: string, width: number): string {
  return text.length >= width ? text.slice(0, width) : " ".repeat(width - text.length) + text;
}

function separator(char: string, width: number = 48): string {
  return char.repeat(width);
}

function rightAlignLine(label: string, value: string, width: number = 48): string {
  const line = label + value;
  if (line.length >= width) return line;
  return " ".repeat(width - line.length) + line;
}

interface PrintInvoiceData {
  company: {
    name?: string;
    address?: string;
    email?: string;
    phone?: string;
    branch?: string;
  };
  invoice: {
    id?: string;
    date?: string;
    time?: string;
    cashier?: string;
  };
  items: Array<{
    name: string;
    qty: string;
    price: string;
    amt: string;
  }>;
  summary: {
    subTotal?: string;
    serviceCharge?: string;
    discount?: string;
    grandTotal?: string;
    payment?: string;
    balance?: string;
  };
}

function buildEscPosReceipt(data: PrintInvoiceData): string {
  const W = 48;
  let r = "";

  r += CMD.INIT;

  r += CMD.ALIGN_CENTER;
  r += CMD.BOLD_ON + CMD.FONT_BIG;
  r += (data.company.name || "") + LF;
  r += CMD.FONT_NORMAL + CMD.BOLD_OFF;

  if (data.company.address) r += data.company.address + LF;
  if (data.company.email) r += data.company.email + LF;
  if (data.company.phone) r += "Tel : " + data.company.phone + LF;

  r += separator("=", W) + LF;

  r += CMD.ALIGN_LEFT;
  r += "Outlet       : " + (data.company.branch || "") + LF;
  r += "Invoice No   : " + (data.invoice.id || "") + LF;
  r += "Invoice Date : " + (data.invoice.date || "") + LF;
  r += "Cashier      : " + (data.invoice.cashier || "") + LF;

  r += CMD.ALIGN_CENTER;
  r += separator("-", W) + LF;

  r += CMD.ALIGN_LEFT;
  for (const item of data.items) {
    const nameW = 24;
    const qtyW = 6;
    const priceW = 9;
    const amtW = 9;
    const line = padRight(item.name, nameW) + padLeft(item.qty, qtyW) + padLeft(item.price, priceW) + padLeft(item.amt, amtW);
    r += line + LF;
  }

  r += CMD.ALIGN_CENTER;
  r += separator("-", W) + LF;

  r += CMD.ALIGN_RIGHT;
  r += rightAlignLine("Sub Total (LKR) :      ", data.summary.subTotal || "0.00", W) + LF;

  if (data.summary.serviceCharge && data.summary.serviceCharge !== "0.00") {
    r += rightAlignLine("Service Charge (LKR) :      ", data.summary.serviceCharge, W) + LF;
  }
  if (data.summary.discount && data.summary.discount !== "0.00") {
    r += rightAlignLine("Discount (LKR) :      ", data.summary.discount, W) + LF;
  }

  r += CMD.BOLD_ON;
  r += rightAlignLine("Grand Total (LKR) :      ", data.summary.grandTotal || "0.00", W) + LF;
  r += CMD.BOLD_OFF;

  r += rightAlignLine("Payment (LKR) :      ", data.summary.payment || "0.00", W) + LF;
  r += rightAlignLine("Balance (LKR) :      ", data.summary.balance || "0.00", W) + LF;

  r += CMD.ALIGN_CENTER;
  r += separator("-", W) + LF;
  r += "Thank you, come again !!!" + LF;
  r += CMD.FONT_SMALL;
  r += "\xA9 MyBiz.lk +94 777721122" + LF;
  r += CMD.FONT_DEFAULT;

  r += CMD.FEED;
  r += CMD.CUT;

  return r;
}

export async function printToThermal(
  printerIp: string,
  printerPort: number,
  data: PrintInvoiceData
): Promise<void> {
  const receipt = buildEscPosReceipt(data);
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    socket.setTimeout(5000);

    socket.connect(printerPort, printerIp, () => {
      socket.write(receipt, "binary", (err) => {
        socket.end();
        if (err) reject(err);
        else resolve();
      });
    });

    socket.on("error", (err) => {
      socket.destroy();
      reject(new Error("Printer connection failed: " + err.message));
    });

    socket.on("timeout", () => {
      socket.destroy();
      reject(new Error("Printer connection timed out"));
    });
  });
}
