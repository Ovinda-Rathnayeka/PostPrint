import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { Platform, PermissionsAndroid, Alert } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

let ThermalPrinter: any = null;
try {
  ThermalPrinter = require("react-native-thermal-pos-printer").default || require("react-native-thermal-pos-printer");
} catch (e) {}

const SAVED_PRINTER_KEY = "@pos_saved_printer";

interface PrinterDevice {
  deviceName: string;
  macAddress: string;
  type: "bluetooth" | "usb";
  nativeDevice?: any;
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

async function requestBluetoothPermissions(): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  try {
    const apiLevel = Platform.Version;
    if (apiLevel >= 31) {
      const results = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ]);
      const allGranted =
        results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] === PermissionsAndroid.RESULTS.GRANTED &&
        results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === PermissionsAndroid.RESULTS.GRANTED &&
        results[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] === PermissionsAndroid.RESULTS.GRANTED;
      if (!allGranted) {
        Alert.alert("Permission Required", "Bluetooth and Location permissions are needed to find printers. Please enable them in Settings.");
        return false;
      }
      return true;
    } else {
      const results = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
      ]);
      const granted =
        results[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] === PermissionsAndroid.RESULTS.GRANTED;
      if (!granted) {
        Alert.alert("Permission Required", "Location permission is needed to find Bluetooth printers. Please enable it in Settings.");
        return false;
      }
      return true;
    }
  } catch (err) {
    console.log("Permission request error:", err);
    return false;
  }
}

export function PrinterProvider({ children }: { children: React.ReactNode }) {
  const [connectedPrinter, setConnectedPrinter] = useState<PrinterDevice | null>(null);
  const [printerList, setPrinterList] = useState<PrinterDevice[]>([]);
  const [scanning, setScanning] = useState(false);
  const printerAvailable = Platform.OS === "android" && ThermalPrinter !== null;

  useEffect(() => {
    loadSavedPrinter();
  }, []);

  const loadSavedPrinter = async () => {
    try {
      const saved = await AsyncStorage.getItem(SAVED_PRINTER_KEY);
      if (saved) {
        const device: PrinterDevice = JSON.parse(saved);
        setConnectedPrinter(device);
        if (printerAvailable) {
          try {
            await ThermalPrinter.init();
            if (device.type === "usb") {
              await ThermalPrinter.connectPrinter(device.macAddress, { type: "USB" });
            } else {
              await ThermalPrinter.connectPrinter(device.macAddress, { type: "BLUETOOTH" });
            }
          } catch (err) {
            console.log("Auto-reconnect failed (will retry on print):", err);
          }
        }
      }
    } catch (e) {
      console.log("Load saved printer error:", e);
    }
  };

  const savePrinter = async (device: PrinterDevice | null) => {
    try {
      if (device) {
        const toSave = { deviceName: device.deviceName, macAddress: device.macAddress, type: device.type };
        await AsyncStorage.setItem(SAVED_PRINTER_KEY, JSON.stringify(toSave));
      } else {
        await AsyncStorage.removeItem(SAVED_PRINTER_KEY);
      }
    } catch (e) {
      console.log("Save printer error:", e);
    }
  };

  const scanPrinters = useCallback(async () => {
    if (!printerAvailable) {
      Alert.alert("Not Available", "Thermal printer support requires running on Android device.");
      return;
    }
    const hasPermission = await requestBluetoothPermissions();
    if (!hasPermission) return;

    setScanning(true);
    try {
      await ThermalPrinter.init();
      const devices = await ThermalPrinter.getDeviceList();
      const mapped: PrinterDevice[] = (devices || []).map((d: any) => ({
        deviceName: d.name || d.deviceName || "Unknown",
        macAddress: d.address || d.macAddress || "",
        type: (d.type === "USB" || d.type === "usb") ? "usb" as const : "bluetooth" as const,
        nativeDevice: d,
      }));
      setPrinterList(mapped);
      if (mapped.length === 0) {
        Alert.alert("No Printers Found", "Make sure your Bluetooth printer is turned on and paired in Android Bluetooth settings, or your USB printer is connected.");
      }
    } catch (err: any) {
      console.log("Scan printers error:", err);
      Alert.alert("Scan Error", err.message || "Failed to scan for printers");
      setPrinterList([]);
    } finally {
      setScanning(false);
    }
  }, [printerAvailable]);

  const connectPrinter = useCallback(async (device: PrinterDevice): Promise<boolean> => {
    if (!printerAvailable) return false;
    try {
      await ThermalPrinter.init();
      if (device.type === "usb") {
        await ThermalPrinter.connectPrinter(device.macAddress, { type: "USB" });
      } else {
        await ThermalPrinter.connectPrinter(device.macAddress, { type: "BLUETOOTH" });
      }
      setConnectedPrinter(device);
      await savePrinter(device);
      return true;
    } catch (err: any) {
      console.log("Connect printer error:", err);
      Alert.alert("Connection Failed", err.message || "Could not connect to printer");
      return false;
    }
  }, [printerAvailable]);

  const disconnectPrinter = useCallback(async () => {
    try {
      if (printerAvailable) {
        await ThermalPrinter.disconnectPrinter();
      }
    } catch (e) {}
    setConnectedPrinter(null);
    await savePrinter(null);
  }, [printerAvailable]);

  const printReceipt = useCallback(async (invoiceData: any): Promise<boolean> => {
    if (!printerAvailable || !connectedPrinter) return false;
    try {
      try {
        const connected = await ThermalPrinter.isConnected();
        if (!connected) {
          await ThermalPrinter.init();
          if (connectedPrinter.type === "usb") {
            await ThermalPrinter.connectPrinter(connectedPrinter.macAddress, { type: "USB" });
          } else {
            await ThermalPrinter.connectPrinter(connectedPrinter.macAddress, { type: "BLUETOOTH" });
          }
        }
      } catch (reconnectErr) {
        await ThermalPrinter.init();
        if (connectedPrinter.type === "usb") {
          await ThermalPrinter.connectPrinter(connectedPrinter.macAddress, { type: "USB" });
        } else {
          await ThermalPrinter.connectPrinter(connectedPrinter.macAddress, { type: "BLUETOOTH" });
        }
      }

      const receiptText = buildReceiptText(invoiceData);
      await ThermalPrinter.printText(receiptText);
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
