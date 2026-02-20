import React, { createContext, useContext, useState, useCallback, useRef } from "react";
import { Platform, Alert } from "react-native";

let ThermalPrinter: any = null;
try {
  ThermalPrinter = require("react-native-thermal-pos-printer");
} catch (e) {}

interface PrinterDevice {
  deviceName: string;
  macAddress: string;
  type: "bluetooth" | "usb";
}

interface PrinterContextType {
  connectedPrinter: PrinterDevice | null;
  printerList: PrinterDevice[];
  scanning: boolean;
  scanPrinters: () => Promise<void>;
  connectPrinter: (device: PrinterDevice) => Promise<boolean>;
  disconnectPrinter: () => Promise<void>;
  printReceipt: (invoiceData: any) => Promise<boolean>;
  printerAvailable: boolean;
}

const PrinterContext = createContext<PrinterContextType>({
  connectedPrinter: null,
  printerList: [],
  scanning: false,
  scanPrinters: async () => {},
  connectPrinter: async () => false,
  disconnectPrinter: async () => {},
  printReceipt: async () => false,
  printerAvailable: false,
});

function padRight(text: string, width: number): string {
  if (text.length >= width) return text.slice(0, width);
  return text + " ".repeat(width - text.length);
}

function padLeft(text: string, width: number): string {
  if (text.length >= width) return text.slice(0, width);
  return " ".repeat(width - text.length) + text;
}

function buildReceiptText(data: any): string {
  const W = 48;
  const sep = "=".repeat(W);
  const sep2 = "-".repeat(W);
  let r = "";

  r += `[C]<b><font size='big'>${data.company?.name || ""}</font></b>\n`;
  if (data.company?.address) r += `[C]${data.company.address}\n`;
  if (data.company?.email) r += `[C]${data.company.email}\n`;
  if (data.company?.phone) r += `[C]Tel : ${data.company.phone}\n`;
  r += `[C]${sep}\n`;

  r += `[L]Outlet       : ${data.company?.branch || ""}\n`;
  r += `[L]Invoice No   : ${data.invoice?.id || ""}\n`;
  r += `[L]Invoice Date : ${data.invoice?.date || ""}\n`;
  r += `[L]Cashier      : ${data.invoice?.cashier || ""}\n`;
  r += `[C]${sep2}\n`;

  for (const item of (data.items || [])) {
    const line = padRight(item.name, 24) + padLeft(item.qty, 6) + padLeft(item.price, 9) + padLeft(item.amt, 9);
    r += `[L]${line}\n`;
  }

  r += `[C]${sep2}\n`;
  r += `[R]Sub Total (LKR) :      ${data.summary?.subTotal || "0.00"}\n`;

  if (data.summary?.serviceCharge && data.summary.serviceCharge !== "0.00") {
    r += `[R]Service Charge (LKR) :      ${data.summary.serviceCharge}\n`;
  }
  if (data.summary?.discount && data.summary.discount !== "0.00") {
    r += `[R]Discount (LKR) :      ${data.summary.discount}\n`;
  }

  r += `[R]<b>Grand Total (LKR) :      ${data.summary?.grandTotal || "0.00"}</b>\n`;
  r += `[R]Payment (LKR) :      ${data.summary?.payment || "0.00"}\n`;
  r += `[R]Balance (LKR) :      ${data.summary?.balance || "0.00"}\n`;
  r += `[C]${sep2}\n`;
  r += `[C]Thank you, come again !!!\n`;
  r += `[C]<font size='small'>© MyBiz.lk +94 777721122</font>\n`;
  r += `[L]\n[L]\n[L]\n[L]\n`;

  return r;
}

export function PrinterProvider({ children }: { children: React.ReactNode }) {
  const [connectedPrinter, setConnectedPrinter] = useState<PrinterDevice | null>(null);
  const [printerList, setPrinterList] = useState<PrinterDevice[]>([]);
  const [scanning, setScanning] = useState(false);
  const printerAvailable = Platform.OS === "android" && ThermalPrinter !== null;

  const scanPrinters = useCallback(async () => {
    if (!printerAvailable) return;
    setScanning(true);
    try {
      const Printer = ThermalPrinter.default || ThermalPrinter;
      await Printer.init();
      const devices = await Printer.getDeviceList();
      const mapped: PrinterDevice[] = (devices || []).map((d: any) => ({
        deviceName: d.deviceName || d.name || "Unknown",
        macAddress: d.macAddress || d.address || "",
        type: d.type === "usb" ? "usb" as const : "bluetooth" as const,
      }));
      setPrinterList(mapped);
    } catch (err: any) {
      console.log("Scan printers error:", err);
      setPrinterList([]);
    } finally {
      setScanning(false);
    }
  }, [printerAvailable]);

  const connectPrinter = useCallback(async (device: PrinterDevice): Promise<boolean> => {
    if (!printerAvailable) return false;
    try {
      const Printer = ThermalPrinter.default || ThermalPrinter;
      if (device.type === "usb") {
        await Printer.connectUsb();
      } else {
        await Printer.connectBluetooth(device.macAddress);
      }
      setConnectedPrinter(device);
      return true;
    } catch (err: any) {
      console.log("Connect printer error:", err);
      return false;
    }
  }, [printerAvailable]);

  const disconnectPrinter = useCallback(async () => {
    if (!printerAvailable) return;
    try {
      const Printer = ThermalPrinter.default || ThermalPrinter;
      await Printer.disconnect();
    } catch (e) {}
    setConnectedPrinter(null);
  }, [printerAvailable]);

  const printReceipt = useCallback(async (invoiceData: any): Promise<boolean> => {
    if (!printerAvailable || !connectedPrinter) return false;
    try {
      const Printer = ThermalPrinter.default || ThermalPrinter;
      const receiptText = buildReceiptText(invoiceData);
      await Printer.printText(receiptText);
      return true;
    } catch (err: any) {
      console.log("Print receipt error:", err);
      return false;
    }
  }, [printerAvailable, connectedPrinter]);

  return (
    <PrinterContext.Provider
      value={{
        connectedPrinter,
        printerList,
        scanning,
        scanPrinters,
        connectPrinter,
        disconnectPrinter,
        printReceipt,
        printerAvailable,
      }}
    >
      {children}
    </PrinterContext.Provider>
  );
}

export function usePrinter() {
  return useContext(PrinterContext);
}
