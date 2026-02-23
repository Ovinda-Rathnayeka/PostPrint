import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { Platform, PermissionsAndroid, Alert, NativeModules } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

let ReactNativePosPrinter: any = null;
try {
  const mod = require("react-native-thermal-pos-printer");
  ReactNativePosPrinter = mod.default || mod.ReactNativePosPrinter || mod;
} catch (e) {
  console.log("Thermal printer module not available:", e);
}

const SAVED_PRINTER_KEY = "@pos_saved_printer";

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
  const printerAvailable = Platform.OS === "android" && ReactNativePosPrinter !== null;

  useEffect(() => {
    loadSavedPrinter();
  }, []);

  const loadSavedPrinter = async () => {
    try {
      const saved = await AsyncStorage.getItem(SAVED_PRINTER_KEY);
      if (saved) {
        const device: PrinterDevice = JSON.parse(saved);
        setConnectedPrinter(device);
        if (printerAvailable && device.type === "bluetooth") {
          try {
            await ReactNativePosPrinter.init();
            await ReactNativePosPrinter.connectPrinter(device.macAddress, { type: "BLUETOOTH" });
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
      await ReactNativePosPrinter.init();
      const devices = await ReactNativePosPrinter.getDeviceList();
      console.log("Raw devices from scanner:", JSON.stringify(devices));
      const mapped: PrinterDevice[] = [];
      for (const d of (devices || [])) {
        let name = "Unknown";
        let address = "";
        let rawType = "BLUETOOTH";

        if (typeof d.getName === "function") {
          name = d.getName() || "Unknown";
          address = d.getAddress() || "";
          rawType = d.getType() || "BLUETOOTH";
        } else if (typeof d.getDevice === "function") {
          const dev = d.getDevice();
          name = dev.name || "Unknown";
          address = dev.address || "";
          rawType = dev.type || "BLUETOOTH";
        } else {
          name = d.name || d.deviceName || "Unknown";
          address = d.address || d.macAddress || "";
          rawType = d.type || "BLUETOOTH";
        }

        const pType = (rawType.toUpperCase() === "USB") ? "usb" as const : "bluetooth" as const;
        if (address) {
          mapped.push({ deviceName: name, macAddress: address, type: pType });
        }
      }
      setPrinterList(mapped);
      if (mapped.length === 0) {
        Alert.alert("No Printers Found", "Make sure your Bluetooth printer is turned on and paired in Android Bluetooth settings.\n\nNote: USB printers are not supported by this printer module. Please use Bluetooth connection.");
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
    if (device.type === "usb") {
      Alert.alert("USB Not Supported", "This printer module only supports Bluetooth connection. Please connect your printer via Bluetooth instead.");
      return false;
    }
    try {
      await ReactNativePosPrinter.init();
      await ReactNativePosPrinter.connectPrinter(device.macAddress, { type: "BLUETOOTH" });
      setConnectedPrinter(device);
      await savePrinter(device);
      Alert.alert("Connected", `Successfully connected to ${device.deviceName}`);
      return true;
    } catch (err: any) {
      console.log("Connect printer error:", err);
      const msg = err.message || "Could not connect to printer";
      Alert.alert("Connection Failed", `${msg}\n\nMake sure the printer is turned on, paired in Bluetooth settings, and within range.`);
      return false;
    }
  }, [printerAvailable]);

  const disconnectPrinter = useCallback(async () => {
    try {
      if (printerAvailable) {
        await ReactNativePosPrinter.disconnectPrinter();
      }
    } catch (e) {}
    setConnectedPrinter(null);
    await savePrinter(null);
  }, [printerAvailable]);

  const printReceipt = useCallback(async (invoiceData: any): Promise<boolean> => {
    if (!printerAvailable || !connectedPrinter) return false;
    try {
      try {
        const connected = await ReactNativePosPrinter.isConnected();
        if (!connected) {
          await ReactNativePosPrinter.init();
          await ReactNativePosPrinter.connectPrinter(connectedPrinter.macAddress, { type: "BLUETOOTH" });
        }
      } catch (reconnectErr) {
        await ReactNativePosPrinter.init();
        await ReactNativePosPrinter.connectPrinter(connectedPrinter.macAddress, { type: "BLUETOOTH" });
      }

      const receiptText = buildReceiptText(invoiceData);
      await ReactNativePosPrinter.printText(receiptText);

      try {
        await ReactNativePosPrinter.cutPaper();
      } catch (cutErr) {
        console.log("Cut paper not supported or failed:", cutErr);
        try {
          await ReactNativePosPrinter.sendRawCommand([0x1D, 0x56, 0x00]);
        } catch (rawCutErr) {
          console.log("Raw cut command also failed:", rawCutErr);
        }
      }

      return true;
    } catch (err: any) {
      console.log("Print receipt error:", err);
      Alert.alert("Print Error", err.message || "Failed to print receipt");
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
