const {
  withAppBuildGradle,
  withProjectBuildGradle,
  withMainApplication,
  withDangerousMod,
} = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

function withUsbPrinterDependency(config) {
  return withAppBuildGradle(config, (config) => {
    if (config.modResults.contents.includes("ESCPOS-ThermalPrinter-Android")) {
      return config;
    }
    config.modResults.contents = config.modResults.contents.replace(
      /dependencies\s*\{/,
      `dependencies {
    implementation 'com.github.DantSu:ESCPOS-ThermalPrinter-Android:3.3.0'`
    );
    return config;
  });
}

function withJitpackRepo(config) {
  return withProjectBuildGradle(config, (config) => {
    if (config.modResults.contents.includes("jitpack.io")) {
      return config;
    }
    config.modResults.contents = config.modResults.contents.replace(
      /allprojects\s*\{\s*repositories\s*\{/,
      `allprojects {
    repositories {
        maven { url 'https://jitpack.io' }`
    );
    return config;
  });
}

function withUsbPrinterNativeModule(config) {
  return withDangerousMod(config, [
    "android",
    async (config) => {
      const packageDir = path.join(
        config.modRequest.platformProjectRoot,
        "app",
        "src",
        "main",
        "java",
        "com",
        "myapp",
        "usbprinter"
      );
      fs.mkdirSync(packageDir, { recursive: true });

      const moduleCode = `package com.myapp.usbprinter;

import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbManager;
import android.os.Build;
import android.util.Log;

import com.dantsu.escposprinter.EscPosPrinter;
import com.dantsu.escposprinter.connection.usb.UsbConnection;
import com.dantsu.escposprinter.connection.usb.UsbPrintersConnections;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.module.annotations.ReactModule;

@ReactModule(name = UsbPrinterModule.NAME)
public class UsbPrinterModule extends ReactContextBaseJavaModule {
    static final String NAME = "UsbPrinterModule";
    private static final String TAG = "UsbPrinterModule";
    private static final String ACTION_USB_PERMISSION = "com.myapp.USB_PERMISSION";
    private UsbConnection currentConnection = null;
    private EscPosPrinter currentPrinter = null;

    public UsbPrinterModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @Override
    public String getName() {
        return NAME;
    }

    @ReactMethod
    public void getUsbDeviceList(Promise promise) {
        try {
            UsbPrintersConnections connectionsManager = new UsbPrintersConnections(getReactApplicationContext());
            UsbConnection[] connections = connectionsManager.getList();

            WritableArray deviceList = Arguments.createArray();
            if (connections != null) {
                for (int i = 0; i < connections.length; i++) {
                    UsbConnection conn = connections[i];
                    UsbDevice device = conn.getDevice();
                    WritableMap deviceInfo = Arguments.createMap();
                    deviceInfo.putString("name", device.getProductName() != null ? device.getProductName() : "USB Printer");
                    deviceInfo.putInt("deviceId", device.getDeviceId());
                    deviceInfo.putInt("vendorId", device.getVendorId());
                    deviceInfo.putInt("productId", device.getProductId());
                    deviceInfo.putString("deviceName", device.getDeviceName());
                    deviceInfo.putString("address", String.valueOf(device.getDeviceId()));
                    deviceInfo.putString("type", "USB");
                    deviceInfo.putInt("index", i);
                    deviceList.pushMap(deviceInfo);
                }
            }
            promise.resolve(deviceList);
        } catch (Exception e) {
            Log.e(TAG, "Error getting USB devices: " + e.getMessage());
            promise.reject("USB_ERROR", "Failed to get USB devices: " + e.getMessage(), e);
        }
    }

    @ReactMethod
    public void connectUsbPrinter(int index, Promise promise) {
        try {
            UsbPrintersConnections connectionsManager = new UsbPrintersConnections(getReactApplicationContext());
            UsbConnection[] connections = connectionsManager.getList();

            if (connections == null || connections.length == 0) {
                promise.reject("NO_USB_PRINTER", "No USB printer found. Make sure the printer is connected via USB.");
                return;
            }

            int connIndex = index;
            if (connIndex < 0 || connIndex >= connections.length) {
                connIndex = 0;
            }

            UsbConnection connection = connections[connIndex];
            UsbManager usbManager = (UsbManager) getReactApplicationContext().getSystemService(Context.USB_SERVICE);
            UsbDevice device = connection.getDevice();

            if (!usbManager.hasPermission(device)) {
                final int finalConnIndex = connIndex;
                int flags = 0;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    flags = PendingIntent.FLAG_MUTABLE;
                }
                PendingIntent permissionIntent = PendingIntent.getBroadcast(
                    getReactApplicationContext(), 0,
                    new Intent(ACTION_USB_PERMISSION), flags
                );

                BroadcastReceiver usbReceiver = new BroadcastReceiver() {
                    @Override
                    public void onReceive(Context context, Intent intent) {
                        if (ACTION_USB_PERMISSION.equals(intent.getAction())) {
                            context.unregisterReceiver(this);
                            boolean granted = intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false);
                            if (granted) {
                                try {
                                    doConnect(connections[finalConnIndex], promise);
                                } catch (Exception e) {
                                    promise.reject("CONNECTION_FAILED", e.getMessage(), e);
                                }
                            } else {
                                promise.reject("PERMISSION_DENIED", "USB permission denied by user");
                            }
                        }
                    }
                };

                IntentFilter filter = new IntentFilter(ACTION_USB_PERMISSION);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    getReactApplicationContext().registerReceiver(usbReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
                } else {
                    getReactApplicationContext().registerReceiver(usbReceiver, filter);
                }

                usbManager.requestPermission(device, permissionIntent);
                return;
            }

            doConnect(connection, promise);
        } catch (Exception e) {
            Log.e(TAG, "Error connecting USB printer: " + e.getMessage());
            promise.reject("CONNECTION_FAILED", "Failed to connect USB printer: " + e.getMessage(), e);
        }
    }

    private void doConnect(UsbConnection connection, Promise promise) {
        try {
            if (currentPrinter != null) {
                try { currentPrinter.disconnectPrinter(); } catch (Exception ignored) {}
            }
            currentConnection = connection;
            currentPrinter = new EscPosPrinter(connection, 203, 72f, 48);
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("CONNECTION_FAILED", "Failed to connect: " + e.getMessage(), e);
        }
    }

    @ReactMethod
    public void printText(String text, Promise promise) {
        try {
            if (currentPrinter == null) {
                promise.reject("NOT_CONNECTED", "No USB printer connected");
                return;
            }
            currentPrinter.printFormattedTextAndCut(text);
            promise.resolve(true);
        } catch (Exception e) {
            Log.e(TAG, "Print error: " + e.getMessage());
            promise.reject("PRINT_FAILED", "Print failed: " + e.getMessage(), e);
        }
    }

    @ReactMethod
    public void printTextWithoutCut(String text, Promise promise) {
        try {
            if (currentPrinter == null) {
                promise.reject("NOT_CONNECTED", "No USB printer connected");
                return;
            }
            currentPrinter.printFormattedText(text);
            promise.resolve(true);
        } catch (Exception e) {
            Log.e(TAG, "Print error: " + e.getMessage());
            promise.reject("PRINT_FAILED", "Print failed: " + e.getMessage(), e);
        }
    }

    @ReactMethod
    public void disconnectPrinter(Promise promise) {
        try {
            if (currentPrinter != null) {
                currentPrinter.disconnectPrinter();
                currentPrinter = null;
                currentConnection = null;
            }
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("DISCONNECT_FAILED", e.getMessage(), e);
        }
    }

    @ReactMethod
    public void isConnected(Promise promise) {
        promise.resolve(currentPrinter != null);
    }
}
`;
      fs.writeFileSync(
        path.join(packageDir, "UsbPrinterModule.java"),
        moduleCode
      );

      const packageCode = `package com.myapp.usbprinter;

import com.facebook.react.ReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.uimanager.ViewManager;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public class UsbPrinterPackage implements ReactPackage {
    @Override
    public List<NativeModule> createNativeModules(ReactApplicationContext reactContext) {
        List<NativeModule> modules = new ArrayList<>();
        modules.add(new UsbPrinterModule(reactContext));
        return modules;
    }

    @Override
    public List<ViewManager> createViewManagers(ReactApplicationContext reactContext) {
        return Collections.emptyList();
    }
}
`;
      fs.writeFileSync(
        path.join(packageDir, "UsbPrinterPackage.java"),
        packageCode
      );

      return config;
    },
  ]);
}

function withUsbPrinterRegistration(config) {
  return withMainApplication(config, (config) => {
    const contents = config.modResults.contents;

    if (contents.includes("UsbPrinterPackage")) {
      return config;
    }

    let modified = contents;

    if (!modified.includes("import com.myapp.usbprinter.UsbPrinterPackage")) {
      modified = modified.replace(
        /import com\.facebook\.react\.defaults\.DefaultReactNativeHost/,
        `import com.facebook.react.defaults.DefaultReactNativeHost
import com.myapp.usbprinter.UsbPrinterPackage`
      );
    }

    modified = modified.replace(
      /override fun getPackages\(\): List<ReactPackage> \{[^}]*return PackageList\(this\)\.packages\.apply \{/,
      `override fun getPackages(): List<ReactPackage> {
            return PackageList(this).packages.apply {
              add(UsbPrinterPackage())`
    );

    config.modResults.contents = modified;
    return config;
  });
}

module.exports = function withUsbPrinter(config) {
  config = withUsbPrinterDependency(config);
  config = withJitpackRepo(config);
  config = withUsbPrinterNativeModule(config);
  config = withUsbPrinterRegistration(config);
  return config;
};
