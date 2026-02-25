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

const UsbPrinterModule = NativeModules.UsbPrinterModule || null;

const SAVED_PRINTER_KEY = "@pos_saved_printer";

interface PrinterDevice {
  deviceName: string;
  macAddress: string;
  type: "bluetooth" | "usb";
  index?: number;
}

interface PrinterContextType {
  connectedPrinter: PrinterDevice | null;
  printerList: PrinterDevice[];
  scanning: boolean;
  scanPrinters: () => Promise<void>;
  scanUsbPrinters: () => Promise<void>;
  connectPrinter: (device: PrinterDevice) => Promise<boolean>;
  disconnectPrinter: () => Promise<void>;
  printReceipt: (invoiceData: any) => Promise<boolean>;
  printerAvailable: boolean;
  usbAvailable: boolean;
}

const PrinterContext = createContext<PrinterContextType>({
  connectedPrinter: null,
  printerList: [],
  scanning: false,
  scanPrinters: async () => {},
  scanUsbPrinters: async () => {},
  connectPrinter: async () => false,
  disconnectPrinter: async () => {},
  printReceipt: async () => false,
  printerAvailable: false,
  usbAvailable: false,
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
  const scAmt = parseFloat(data.summary?.serviceCharge || "0");
  if (scAmt > 0) r += `[R]Service Charge  :      ${scAmt.toFixed(2)}\n`;
  const discAmt = parseFloat(data.summary?.discount || "0");
  if (discAmt > 0) r += `[R]Discount        :     -${discAmt.toFixed(2)}\n`;
  r += `[R]<b>Grand Total (LKR) :      ${data.summary?.grandTotal || "0.00"}</b>\n`;
  r += `[R]Payment (LKR) :      ${data.summary?.payment || "0.00"}\n`;
  const balAmt = parseFloat(data.summary?.balance || "0");
  if (balAmt > 0) r += `[R]Balance (LKR) :      ${balAmt.toFixed(2)}\n`;
  r += `[C]${sep2}\n`;
  r += `[C]Thank you, come again !!!\n`;
  r += `[C]<font size='small'>Software By MyBiz.lk +94 777721122</font>\n`;
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
  const usbAvailable = Platform.OS === "android" && UsbPrinterModule !== null;

  useEffect(() => {
    loadSavedPrinter();
  }, []);

  const loadSavedPrinter = async () => {
    try {
      const saved = await AsyncStorage.getItem(SAVED_PRINTER_KEY);
      if (saved) {
        const device: PrinterDevice = JSON.parse(saved);
        setConnectedPrinter(device);
        if (device.type === "bluetooth" && printerAvailable) {
          try {
            await ReactNativePosPrinter.init();
            await ReactNativePosPrinter.connectPrinter(device.macAddress, { type: "BLUETOOTH" });
          } catch (err) {
            console.log("Auto-reconnect Bluetooth failed (will retry on print):", err);
          }
        } else if (device.type === "usb" && usbAvailable) {
          try {
            await UsbPrinterModule.connectUsbPrinter(device.index || 0);
          } catch (err) {
            console.log("Auto-reconnect USB failed (will retry on print):", err);
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
        await AsyncStorage.setItem(SAVED_PRINTER_KEY, JSON.stringify(device));
      } else {
        await AsyncStorage.removeItem(SAVED_PRINTER_KEY);
      }
    } catch (e) {
      console.log("Save printer error:", e);
    }
  };

  const scanPrinters = useCallback(async () => {
    if (!printerAvailable) {
      Alert.alert("Not Available", "Bluetooth printer support requires running on Android device with the native build.");
      return;
    }
    const hasPermission = await requestBluetoothPermissions();
    if (!hasPermission) return;

    setScanning(true);
    try {
      await ReactNativePosPrinter.init();
      const devices = await ReactNativePosPrinter.getDeviceList();
      console.log("Raw Bluetooth devices:", JSON.stringify(devices));
      const mapped: PrinterDevice[] = [];
      for (const d of (devices || [])) {
        let name = "Unknown";
        let address = "";

        if (typeof d.getName === "function") {
          name = d.getName() || "Unknown";
          address = d.getAddress() || "";
        } else if (typeof d.getDevice === "function") {
          const dev = d.getDevice();
          name = dev.name || "Unknown";
          address = dev.address || "";
        } else {
          name = d.name || d.deviceName || "Unknown";
          address = d.address || d.macAddress || "";
        }

        if (address) {
          mapped.push({ deviceName: name, macAddress: address, type: "bluetooth" });
        }
      }
      setPrinterList(mapped);
      if (mapped.length === 0) {
        Alert.alert("No Bluetooth Printers", "Make sure your Bluetooth printer is turned on and paired in Android Bluetooth settings.\n\nTip: You can also try scanning for USB printers.");
      }
    } catch (err: any) {
      console.log("Scan Bluetooth error:", err);
      Alert.alert("Scan Error", err.message || "Failed to scan for Bluetooth printers");
      setPrinterList([]);
    } finally {
      setScanning(false);
    }
  }, [printerAvailable]);

  const scanUsbPrinters = useCallback(async () => {
    if (!usbAvailable) {
      Alert.alert("Not Available", "USB printer support requires the native build with USB module.");
      return;
    }

    setScanning(true);
    try {
      const devices = await UsbPrinterModule.getUsbDeviceList();
      console.log("Raw USB devices:", JSON.stringify(devices));
      const mapped: PrinterDevice[] = [];
      for (const d of (devices || [])) {
        mapped.push({
          deviceName: d.name || "USB Printer",
          macAddress: d.address || String(d.deviceId),
          type: "usb",
          index: d.index || 0,
        });
      }

      setPrinterList((prev) => {
        const btDevices = prev.filter((p) => p.type === "bluetooth");
        return [...btDevices, ...mapped];
      });

      if (mapped.length === 0) {
        Alert.alert("No USB Printers", "Make sure your USB printer is connected to the tablet via USB cable or USB OTG adapter.");
      }
    } catch (err: any) {
      console.log("Scan USB error:", err);
      Alert.alert("USB Scan Error", err.message || "Failed to scan for USB printers");
    } finally {
      setScanning(false);
    }
  }, [usbAvailable]);

  const connectPrinter = useCallback(async (device: PrinterDevice): Promise<boolean> => {
    try {
      if (device.type === "usb") {
        if (!usbAvailable) {
          Alert.alert("USB Not Available", "USB printer module not found. Make sure you're using the native build.");
          return false;
        }
        await UsbPrinterModule.connectUsbPrinter(device.index || 0);
        setConnectedPrinter(device);
        await savePrinter(device);
        Alert.alert("Connected", `USB printer "${device.deviceName}" connected successfully!`);
        return true;
      } else {
        if (!printerAvailable) {
          Alert.alert("Bluetooth Not Available", "Bluetooth printer module not found.");
          return false;
        }
        await ReactNativePosPrinter.init();
        await ReactNativePosPrinter.connectPrinter(device.macAddress, { type: "BLUETOOTH" });
        setConnectedPrinter(device);
        await savePrinter(device);
        Alert.alert("Connected", `Bluetooth printer "${device.deviceName}" connected successfully!`);
        return true;
      }
    } catch (err: any) {
      console.log("Connect printer error:", err);
      const msg = err.message || "Could not connect to printer";
      if (device.type === "usb") {
        Alert.alert("USB Connection Failed", `${msg}\n\nMake sure the USB printer is connected and USB permission is granted.`);
      } else {
        Alert.alert("Bluetooth Connection Failed", `${msg}\n\nMake sure the printer is turned on, paired in Bluetooth settings, and within range.`);
      }
      return false;
    }
  }, [printerAvailable, usbAvailable]);

  const disconnectPrinter = useCallback(async () => {
    try {
      if (connectedPrinter?.type === "usb" && usbAvailable) {
        await UsbPrinterModule.disconnectPrinter();
      } else if (connectedPrinter?.type === "bluetooth" && printerAvailable) {
        await ReactNativePosPrinter.disconnectPrinter();
      }
    } catch (e) {
      console.log("Disconnect error:", e);
    }
    setConnectedPrinter(null);
    await savePrinter(null);
  }, [connectedPrinter, printerAvailable, usbAvailable]);

  const printReceipt = useCallback(async (invoiceData: any): Promise<boolean> => {
    if (!connectedPrinter) {
      Alert.alert("No Printer", "Please connect a printer first (Bluetooth or USB).");
      return false;
    }

    const receiptText = buildReceiptText(invoiceData);

    try {
      if (connectedPrinter.type === "usb") {
        if (!usbAvailable) {
          Alert.alert("USB Not Available", "USB printer module not found.");
          return false;
        }
        try {
          const isConn = await UsbPrinterModule.isConnected();
          if (!isConn) {
            await UsbPrinterModule.connectUsbPrinter(connectedPrinter.index || 0);
          }
        } catch (reconnErr) {
          await UsbPrinterModule.connectUsbPrinter(connectedPrinter.index || 0);
        }
        await UsbPrinterModule.printText(receiptText);
        return true;
      } else {
        if (!printerAvailable) {
          Alert.alert("Bluetooth Not Available", "Bluetooth printer module not found.");
          return false;
        }
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
        let printed = false;
        if (typeof ReactNativePosPrinter.printFormattedTextAndCut === "function") {
          await ReactNativePosPrinter.printFormattedTextAndCut(receiptText);
          printed = true;
        } else if (typeof ReactNativePosPrinter.printFormattedText === "function") {
          await ReactNativePosPrinter.printFormattedText(receiptText);
          printed = true;
        }
        if (!printed) {
          await ReactNativePosPrinter.printText(receiptText);
        }
        if (!printed || typeof ReactNativePosPrinter.printFormattedTextAndCut !== "function") {
          try {
            if (typeof ReactNativePosPrinter.cutPaper === "function") {
              await ReactNativePosPrinter.cutPaper();
            } else if (typeof ReactNativePosPrinter.sendRawCommand === "function") {
              await ReactNativePosPrinter.sendRawCommand([0x1D, 0x56, 0x00]);
            }
          } catch (cutErr) {
            console.log("Cut command not supported:", cutErr);
          }
        }
        return true;
      }
    } catch (err: any) {
      console.log("Print receipt error:", err);
      Alert.alert("Print Error", err.message || "Failed to print receipt");
      return false;
    }
  }, [connectedPrinter, printerAvailable, usbAvailable]);

  return (
    <PrinterContext.Provider
      value={{
        connectedPrinter,
        printerList,
        scanning,
        scanPrinters,
        scanUsbPrinters,
        connectPrinter,
        disconnectPrinter,
        printReceipt,
        printerAvailable,
        usbAvailable,
      }}
    >
      {children}
    </PrinterContext.Provider>
  );
}

export function usePrinter() {
  return useContext(PrinterContext);
}
