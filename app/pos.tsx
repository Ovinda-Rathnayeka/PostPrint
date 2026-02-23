import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  Pressable,
  TextInput,
  ActivityIndicator,
  Platform,
  ScrollView,
  Alert,
  Switch,
  Keyboard,
  StatusBar as RNStatusBar,
} from "react-native";
import { Ionicons, MaterialCommunityIcons, Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import * as NavigationBar from "expo-navigation-bar";
import * as Print from "expo-print";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/AuthContext";
import { useCart } from "@/lib/CartContext";
import { usePrinter } from "@/lib/PrinterContext";
import { getApiUrl, apiRequest, queryClient } from "@/lib/query-client";

interface Category {
  id: number;
  catcode: string;
  catname: string;
}

interface MenuItem {
  menucode: number;
  menuname: string;
  sellingprice: string;
  costprice: string;
  category: string;
}

type PaymentMethod = "Cash" | "Card" | "CardandCash";
type ActiveField = "cash" | "discount" | "cardAmount" | null;

export default function POSScreen() {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const { items: cartItems, addItem, removeItem, updateQty, total, itemCount, clearCart } = useCart();
  const { connectedPrinter, printerList, scanning, scanPrinters, scanUsbPrinters, connectPrinter, disconnectPrinter, printReceipt, printerAvailable, usbAvailable } = usePrinter();
  const [showPrinterModal, setShowPrinterModal] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [searchText, setSearchText] = useState("");

  const [serviceChargeOn, setServiceChargeOn] = useState(false);
  const [discountRate, setDiscountRate] = useState("");
  const [payMethod, setPayMethod] = useState<PaymentMethod>("Cash");
  const [cashAmount, setCashAmount] = useState("");
  const [cardAmount, setCardAmount] = useState("");
  const [cardRef, setCardRef] = useState("");
  const [bankName, setBankName] = useState("");
  const [processing, setProcessing] = useState(false);
  const [activeField, setActiveField] = useState<ActiveField>("cash");

  const [successBill, setSuccessBill] = useState<string | null>(null);
  const [successBalance, setSuccessBalance] = useState<number>(0);
  const [showNotes, setShowNotes] = useState(false);

  const isNative = Platform.OS !== "web";

  useEffect(() => {
    if (isNative) {
      Keyboard.dismiss();
    }
    if (Platform.OS === "android") {
      NavigationBar.setVisibilityAsync("hidden");
      NavigationBar.setBehaviorAsync("overlay-swipe");
      RNStatusBar.setHidden(true);
    }
  }, []);

  const webTopInset = Platform.OS === "web" ? 20 : 0;

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });

  const { data: menuItems = [], isLoading: menuLoading } = useQuery<MenuItem[]>({
    queryKey: ["/api/menu-items", selectedCategory, searchText],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedCategory !== "all") params.set("category", selectedCategory);
      if (searchText) params.set("search", searchText);
      const url = new URL(`/api/menu-items?${params}`, getApiUrl());
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const { data: scData } = useQuery<{ percentage: number }>({
    queryKey: ["/api/service-charge"],
  });
  const rawScPercent = scData?.percentage ?? 10;
  const scPercent = rawScPercent > 100 ? rawScPercent - 100 : rawScPercent;

  const discountPercent = parseFloat(discountRate) || 0;
  const discountAmt = (total * discountPercent) / 100;
  const sc = serviceChargeOn ? (total * scPercent) / 100 : 0;
  const grandTotal = total + sc - discountAmt;
  const cashVal = parseFloat(cashAmount) || 0;
  const balance = payMethod === "Cash" ? cashVal - grandTotal : 0;

  const NOTES = [5000, 2000, 1000, 500, 100, 50, 20, 10];

  const handleNotePress = useCallback((note: number) => {
    const current = parseFloat(cashAmount) || 0;
    setCashAmount(String(current + note));
    if (Platform.OS !== "web") Haptics.selectionAsync();
  }, [cashAmount]);

  const handleNoteMinus = useCallback((note: number) => {
    const current = parseFloat(cashAmount) || 0;
    const newVal = current - note;
    setCashAmount(newVal > 0 ? String(newVal) : "0");
    if (Platform.OS !== "web") Haptics.selectionAsync();
  }, [cashAmount]);

  const handleAddItem = useCallback((item: MenuItem) => {
    addItem(String(item.menucode), item.menuname, Number(item.sellingprice));
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [addItem]);

  const handleNumpadPress = useCallback((key: string) => {
    if (!activeField) return;
    const setter = activeField === "cash" ? setCashAmount :
                   activeField === "discount" ? setDiscountRate :
                   setCardAmount;
    const currentVal = activeField === "cash" ? cashAmount :
                       activeField === "discount" ? discountRate :
                       cardAmount;

    if (key === "Delete") {
      setter(currentVal.slice(0, -1));
    } else if (key === ".") {
      if (!currentVal.includes(".")) setter(currentVal + ".");
    } else {
      setter(currentVal + key);
    }
    if (Platform.OS !== "web") Haptics.selectionAsync();
  }, [activeField, cashAmount, discountRate, cardAmount]);

  const placeOrder = async () => {
    const effectiveCash = (payMethod === "Cash" && cashVal === 0) ? grandTotal : cashVal;
    if (payMethod === "Cash" && effectiveCash < grandTotal) {
      if (Platform.OS === "web") {
        alert("Cash amount must be equal to or greater than the total");
      } else {
        Alert.alert("Insufficient Amount", "Cash amount must be equal to or greater than the total");
      }
      return null;
    }

    const res = await apiRequest("POST", "/api/place-order", {
      items: cartItems.map((i) => ({ code: i.code, name: i.name, price: i.price, qty: i.qty })),
      total,
      discount: discountAmt,
      discountRate: discountPercent,
      serviceCharge: serviceChargeOn,
      paytype: payMethod,
      cash: effectiveCash,
      card: parseFloat(cardAmount) || 0,
      cardRef,
      bankName,
      userId: user?.id || "1",
      branch: user?.branch || "1",
      customer: "counter",
    });
    const data = await res.json();
    return data;
  };

  const afterOrderSuccess = (billNo: string, bal: number) => {
    setSuccessBill(billNo);
    setSuccessBalance(bal);
    resetAll();
    queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
    queryClient.invalidateQueries({ queryKey: ["/api/daily-summary"] });
    if (isNative) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  const buildReceiptHtml = (invoiceData: any) => {
    const { company, invoice, items: invItems, summary } = invoiceData;
    let itemsHtml = "";
    for (const item of invItems) {
      itemsHtml += `<tr><td>${item.name}</td><td class="c">${item.qty}</td><td class="r">${item.price}</td><td class="r">${item.amt}</td></tr>`;
    }
    const sep = "================================================";
    const sep2 = "------------------------------------------------";
    return `<html><head><meta name="viewport" content="width=72mm"><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Courier New',monospace;font-size:11px;width:72mm;padding:2mm;line-height:1.3}table{width:100%;border-collapse:collapse}td{padding:0;font-size:11px}.c{text-align:center}.r{text-align:right}.ct{text-align:center}.b{font-weight:bold}.big{font-size:15px;font-weight:bold}.sep{text-align:center;letter-spacing:-1px;font-size:10px}.row{display:flex;justify-content:space-between}.lbl{white-space:pre}</style></head><body><div class="ct b big">${company?.name || ""}</div>${company?.address ? `<div class="ct">${company.address}</div>` : ""}${company?.email ? `<div class="ct">${company.email}</div>` : ""}${company?.phone ? `<div class="ct">Tel : ${company.phone}</div>` : ""}<div class="sep">${sep}</div><div class="lbl">Outlet       : ${company?.branch || ""}</div><div class="lbl">Invoice No   : ${invoice?.id || ""}</div><div class="lbl">Invoice Date : ${invoice?.date || ""}</div><div class="lbl">Cashier      : ${invoice?.cashier || ""}</div><div class="sep">${sep2}</div><table>${itemsHtml}</table><div class="sep">${sep2}</div><div class="r">Sub Total (LKR) :      ${summary?.subTotal || "0.00"}</div>${summary?.serviceCharge && summary.serviceCharge !== "0.00" ? `<div class="r">Service Charge (LKR) :      ${summary.serviceCharge}</div>` : ""}${summary?.discount && summary.discount !== "0.00" ? `<div class="r">Discount (LKR) :      ${summary.discount}</div>` : ""}<div class="r b">Grand Total (LKR) :      ${summary?.grandTotal || "0.00"}</div><div class="r">Payment (LKR) :      ${summary?.payment || "0.00"}</div><div class="r">Balance (LKR) :      ${summary?.balance || "0.00"}</div><div class="sep">${sep2}</div><div class="ct">Thank you, come again !!!</div><div class="ct" style="font-size:9px">&copy; MyBiz.lk +94 777721122</div></body></html>`;
  };

  const handleInvoice = async () => {
    if (cartItems.length === 0) return;
    const currentBalance = balance;
    setProcessing(true);
    try {
      const data = await placeOrder();
      if (!data) { setProcessing(false); return; }
      afterOrderSuccess(data.billNo, currentBalance);

      try {
        const invoiceUrl = new URL(`/api/invoice-data/${data.billNo}?branch=${user?.branch || "1"}&username=${user?.username || "admin"}`, getApiUrl());
        const invoiceRes = await fetch(invoiceUrl.toString());
        if (invoiceRes.ok) {
          const invoiceData = await invoiceRes.json();
          let printed = false;
          if (connectedPrinter && printerAvailable) {
            printed = await printReceipt(invoiceData);
          }
          if (!printed) {
            const html = buildReceiptHtml(invoiceData);
            await Print.printAsync({ html });
          }
        }
        if (Platform.OS === "android") {
          NavigationBar.setVisibilityAsync("hidden");
          NavigationBar.setBehaviorAsync("overlay-swipe");
          RNStatusBar.setHidden(true);
        }
      } catch (printErr) {
        console.log("Print (non-fatal):", printErr);
        if (Platform.OS === "android") {
          NavigationBar.setVisibilityAsync("hidden");
          NavigationBar.setBehaviorAsync("overlay-swipe");
          RNStatusBar.setHidden(true);
        }
      }
    } catch (err: any) {
      const msg = err.message || "Failed to process payment";
      if (Platform.OS === "web") alert(msg);
      else Alert.alert("Payment Failed", msg);
    } finally {
      setProcessing(false);
    }
  };

  const handleSaveOrder = async () => {
    if (cartItems.length === 0) return;
    const currentBalance = balance;
    setProcessing(true);
    try {
      const data = await placeOrder();
      if (!data) { setProcessing(false); return; }
      afterOrderSuccess(data.billNo, currentBalance);
    } catch (err: any) {
      const msg = err.message || "Failed to save order";
      if (Platform.OS === "web") alert(msg);
      else Alert.alert("Save Failed", msg);
    } finally {
      setProcessing(false);
    }
  };

  const resetAll = useCallback(() => {
    clearCart();
    setCashAmount("");
    setCardAmount("");
    setCardRef("");
    setBankName("");
    setDiscountRate("");
    setServiceChargeOn(false);
    setPayMethod("Cash");
    setActiveField("cash");
  }, [clearCart]);

  const handleCancelOrder = () => {
    if (cartItems.length === 0) return;
    if (Platform.OS === "web") {
      if (confirm("Cancel current order?")) {
        resetAll();
      }
    } else {
      Alert.alert("Cancel Order", "Are you sure you want to cancel?", [
        { text: "No", style: "cancel" },
        { text: "Yes", style: "destructive", onPress: resetAll },
      ]);
    }
  };

  const handleLogout = () => {
    if (Platform.OS === "web") {
      logout().then(() => router.replace("/"));
    } else {
      Alert.alert("Sign Out", "Are you sure?", [
        { text: "Cancel", style: "cancel" },
        { text: "Sign Out", style: "destructive", onPress: () => logout().then(() => router.replace("/")) },
      ]);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      {successBill && (
        <Pressable style={styles.successOverlay} onPress={() => setSuccessBill(null)}>
          <View style={styles.successModal}>
            <View style={styles.successIconCircle}>
              <Ionicons name="checkmark" size={40} color="#FFF" />
            </View>
            <Text style={styles.successTitle}>Invoice Saved</Text>
            <Text style={styles.successBillNo}>{successBill}</Text>
            {successBalance > 0 && (
              <View style={styles.successBalanceBox}>
                <Text style={styles.successBalanceLabel}>Balance</Text>
                <Text style={styles.successBalanceValue}>LKR {successBalance.toFixed(2)}</Text>
              </View>
            )}
            <Pressable style={styles.successOkBtn} onPress={() => setSuccessBill(null)}>
              <Text style={styles.successOkText}>OK</Text>
            </Pressable>
          </View>
        </Pressable>
      )}

      <View style={styles.mainRow}>
        {/* LEFT PANEL - Categories */}
        <View style={styles.leftPanel}>
          <View style={styles.searchBar}>
            <Feather name="search" size={16} color="#999" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search"
              placeholderTextColor="#999"
              value={searchText}
              onChangeText={setSearchText}
              showSoftInputOnFocus={false}
              testID="search-input"
            />
            {searchText ? (
              <Pressable onPress={() => setSearchText("")}>
                <Ionicons name="close-circle" size={16} color="#999" />
              </Pressable>
            ) : null}
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={styles.categoryScroll}>
            <Pressable
              style={[styles.categoryBtn, selectedCategory === "all" && styles.categoryBtnActive]}
              onPress={() => setSelectedCategory("all")}
            >
              <Text style={styles.categoryBtnText}>All Items</Text>
            </Pressable>
            {categories.map((cat) => (
              <Pressable
                key={String(cat.id)}
                style={[styles.categoryBtn, selectedCategory === String(cat.id) && styles.categoryBtnActive]}
                onPress={() => {
                  setSelectedCategory(String(cat.id));
                  if (Platform.OS !== "web") Haptics.selectionAsync();
                }}
              >
                <Text style={styles.categoryBtnText}>{cat.catname}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        {/* CENTER PANEL - Menu Items */}
        <View style={styles.centerPanel}>
          {menuLoading ? (
            <View style={styles.loadingCenter}>
              <ActivityIndicator size="large" color={Colors.light.primary} />
            </View>
          ) : (
            <FlatList
              data={menuItems}
              keyExtractor={(item) => String(item.menucode)}
              numColumns={3}
              columnWrapperStyle={styles.menuRow}
              contentContainerStyle={styles.menuGrid}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => {
                const cartItem = cartItems.find((c) => c.code === String(item.menucode));
                return (
                  <Pressable
                    style={({ pressed }) => [styles.menuItemBtn, pressed && { opacity: 0.8 }]}
                    onPress={() => handleAddItem(item)}
                    testID={`menu-item-${item.menucode}`}
                  >
                    <Text style={styles.menuItemName} numberOfLines={2}>{item.menuname}</Text>
                    <Text style={styles.menuItemPrice}>Rs.{Number(item.sellingprice).toFixed(0)}</Text>
                    {cartItem && (
                      <View style={styles.menuItemBadge}>
                        <Text style={styles.menuItemBadgeText}>{cartItem.qty}</Text>
                      </View>
                    )}
                  </Pressable>
                );
              }}
              ListEmptyComponent={
                <View style={styles.emptyMenu}>
                  <Text style={styles.emptyMenuText}>Select a category to view items</Text>
                </View>
              }
            />
          )}
        </View>

        {/* RIGHT PANEL - Billing & Controls */}
        <View style={styles.rightPanel}>
          {/* Order Type Tabs */}
          <View style={styles.orderTypeTabs}>
            <Pressable style={[styles.orderTypeTab, styles.orderTypeTabActive]}>
              <Text style={[styles.orderTypeTabText, styles.orderTypeTabTextActive]}>Counter</Text>
            </Pressable>
            <Pressable style={styles.orderTypeTab} onPress={() => router.push("/orders")}>
              <Text style={styles.orderTypeTabText}>Orders</Text>
            </Pressable>
            <Pressable style={styles.orderTypeTab} onPress={handleLogout}>
              <Text style={styles.orderTypeTabText}>Logout</Text>
            </Pressable>
          </View>

          {/* Billing Area */}
          <View style={styles.billingArea}>
            {/* Service Charge Toggle */}
            <View style={styles.scRow}>
              <Text style={styles.scLabel}>Service charge</Text>
              <Switch
                value={serviceChargeOn}
                onValueChange={setServiceChargeOn}
                trackColor={{ false: "#ccc", true: Colors.light.primary }}
                thumbColor="#fff"
              />
            </View>

            {/* Cart Items List */}
            <ScrollView style={styles.cartItemsScroll} showsVerticalScrollIndicator={false}>
              {cartItems.map((ci) => (
                <View key={ci.code} style={styles.cartItemRow}>
                  <Pressable style={styles.cartItemRemove} onPress={() => removeItem(ci.code)}>
                    <Ionicons name="close" size={12} color="#FFF" />
                  </Pressable>
                  <Text style={styles.cartItemName} numberOfLines={1}>{ci.name}</Text>
                  <View style={styles.cartItemQtyRow}>
                    <Pressable style={styles.cartQtyBtn} onPress={() => updateQty(ci.code, ci.qty - 1)}>
                      <Ionicons name="remove" size={14} color={Colors.light.primary} />
                    </Pressable>
                    <Text style={styles.cartQtyText}>{ci.qty}</Text>
                    <Pressable style={styles.cartQtyBtn} onPress={() => updateQty(ci.code, ci.qty + 1)}>
                      <Ionicons name="add" size={14} color={Colors.light.primary} />
                    </Pressable>
                  </View>
                  <Text style={styles.cartItemTotal}>Rs.{(ci.price * ci.qty).toFixed(2)}</Text>
                </View>
              ))}
            </ScrollView>

            {/* Totals */}
            <View style={styles.totalsSection}>
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Total(LKR)</Text>
                <TextInput
                  style={styles.totalInput}
                  value={total.toFixed(2)}
                  editable={false}
                />
              </View>

              {sc > 0 && (
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>SC({scPercent}%)</Text>
                  <TextInput
                    style={styles.totalInput}
                    value={sc.toFixed(2)}
                    editable={false}
                  />
                </View>
              )}

              {discountAmt > 0 && (
                <View style={styles.totalRow}>
                  <Text style={[styles.totalLabel, { color: Colors.light.danger }]}>Disc({discountPercent}%)</Text>
                  <TextInput
                    style={[styles.totalInput, { color: Colors.light.danger }]}
                    value={`-${discountAmt.toFixed(2)}`}
                    editable={false}
                  />
                </View>
              )}

              <View style={styles.totalRow}>
                <Text style={[styles.totalLabel, { fontWeight: "700" as const }]}>Final Pay(LKR)</Text>
                <TextInput
                  style={[styles.totalInput, { fontWeight: "700" as const, fontSize: 16 }]}
                  value={grandTotal.toFixed(2)}
                  editable={false}
                />
              </View>

              {/* Payment Method Checkboxes */}
              <View style={styles.payMethodRow}>
                {(["Cash", "Card", "CardandCash"] as PaymentMethod[]).map((method) => (
                  <Pressable
                    key={method}
                    style={styles.payCheckRow}
                    onPress={() => {
                      setPayMethod(method);
                      if (method === "Cash" || method === "CardandCash") setActiveField("cash");
                      else setActiveField(null);
                    }}
                  >
                    <View style={[styles.checkbox, payMethod === method && styles.checkboxActive]}>
                      {payMethod === method && <Ionicons name="checkmark" size={14} color="#FFF" />}
                    </View>
                    <Text style={styles.payCheckLabel}>{method === "CardandCash" ? "Split" : method}</Text>
                  </Pressable>
                ))}
              </View>

              {/* Cash Amount */}
              {(payMethod === "Cash" || payMethod === "CardandCash") && (
                <View>
                  <View style={styles.totalRow}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <Text style={styles.totalLabel}>Cash(LKR)</Text>
                      <Pressable testID="toggle-notes" onPress={() => setShowNotes(!showNotes)} style={{ padding: 2 }}>
                        <MaterialCommunityIcons name={showNotes ? "chevron-up" : "cash-multiple"} size={18} color={Colors.light.primaryDark} />
                      </Pressable>
                    </View>
                    <Pressable onPress={() => { setActiveField("cash"); if (isNative) Keyboard.dismiss(); }}>
                      <TextInput
                        style={[styles.totalInput, activeField === "cash" && styles.totalInputActive]}
                        value={cashAmount}
                        placeholder="0.00"
                        placeholderTextColor="#999"
                        onChangeText={setCashAmount}
                        onFocus={() => { setActiveField("cash"); if (isNative) Keyboard.dismiss(); }}
                        showSoftInputOnFocus={false}
                        keyboardType="numeric"
                      />
                    </Pressable>
                  </View>
                  {showNotes && (
                    <View style={styles.notesGrid}>
                      {NOTES.map((note) => (
                        <View key={note} style={styles.noteItem}>
                          <Pressable testID={`note-minus-${note}`} style={styles.noteMinusBtn} onPress={() => handleNoteMinus(note)}>
                            <Ionicons name="remove" size={12} color="#FFF" />
                          </Pressable>
                          <Pressable testID={`note-${note}`} style={styles.noteBtn} onPress={() => handleNotePress(note)}>
                            <Text style={styles.noteBtnText}>{note >= 1000 ? `${note/1000}K` : note}</Text>
                          </Pressable>
                          <Pressable testID={`note-plus-${note}`} style={styles.notePlusBtn} onPress={() => handleNotePress(note)}>
                            <Ionicons name="add" size={12} color="#FFF" />
                          </Pressable>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              )}

              {/* Card Amount for split */}
              {payMethod === "CardandCash" && (
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Card(LKR)</Text>
                  <Pressable onPress={() => { setActiveField("cardAmount"); if (isNative) Keyboard.dismiss(); }}>
                    <TextInput
                      style={[styles.totalInput, activeField === "cardAmount" && styles.totalInputActive]}
                      value={cardAmount}
                      placeholder="0.00"
                      placeholderTextColor="#999"
                      onChangeText={setCardAmount}
                      onFocus={() => { setActiveField("cardAmount"); if (isNative) Keyboard.dismiss(); }}
                      showSoftInputOnFocus={false}
                      keyboardType="numeric"
                    />
                  </Pressable>
                </View>
              )}

              {/* Bank Name & Card Ref for card payments */}
              {(payMethod === "Card" || payMethod === "CardandCash") && (
                <>
                  <View style={styles.totalRow}>
                    <Text style={styles.totalLabel}>Bank</Text>
                    <TextInput
                      style={styles.totalInput}
                      value={bankName}
                      placeholder="Bank name"
                      placeholderTextColor="#999"
                      onChangeText={setBankName}
                      showSoftInputOnFocus={false}
                    />
                  </View>
                  <View style={styles.totalRow}>
                    <Text style={styles.totalLabel}>Card Ref</Text>
                    <TextInput
                      style={styles.totalInput}
                      value={cardRef}
                      placeholder="Reference"
                      placeholderTextColor="#999"
                      onChangeText={setCardRef}
                      showSoftInputOnFocus={false}
                    />
                  </View>
                </>
              )}

              {/* Discount */}
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Discount(%)</Text>
                <Pressable onPress={() => { setActiveField("discount"); if (isNative) Keyboard.dismiss(); }}>
                  <TextInput
                    style={[styles.totalInput, activeField === "discount" && styles.totalInputActive]}
                    value={discountRate}
                    placeholder="0"
                    placeholderTextColor="#999"
                    onChangeText={setDiscountRate}
                    onFocus={() => { setActiveField("discount"); if (isNative) Keyboard.dismiss(); }}
                    showSoftInputOnFocus={false}
                    keyboardType="numeric"
                  />
                </Pressable>
              </View>

              {/* Balance */}
              {payMethod === "Cash" && cashVal >= grandTotal && grandTotal > 0 && (
                <View style={styles.totalRow}>
                  <Text style={[styles.totalLabel, { color: Colors.light.success }]}>Balance(LKR)</Text>
                  <TextInput
                    style={[styles.totalInput, { color: Colors.light.success, fontWeight: "700" as const }]}
                    value={balance.toFixed(2)}
                    editable={false}
                  />
                </View>
              )}
            </View>
          </View>

          {/* Number Pad & Action Buttons */}
          <View style={styles.numpadSection}>
            <View style={styles.numpadGrid}>
              {/* Row 1 */}
              <Pressable style={styles.numKey} onPress={() => handleNumpadPress("1")}>
                <Text style={styles.numKeyText}>1</Text>
              </Pressable>
              <Pressable style={styles.numKey} onPress={() => handleNumpadPress("2")}>
                <Text style={styles.numKeyText}>2</Text>
              </Pressable>
              <Pressable style={styles.numKey} onPress={() => handleNumpadPress("3")}>
                <Text style={styles.numKeyText}>3</Text>
              </Pressable>
              <Pressable style={[styles.actionKey, { backgroundColor: Colors.light.primary }]} onPress={resetAll}>
                <Ionicons name="home" size={18} color="#FFF" />
                <Text style={styles.actionKeyText}>Home</Text>
              </Pressable>
              <Pressable style={[styles.actionKey, { backgroundColor: "#5A6577" }]} onPress={() => router.push("/orders")}>
                <Ionicons name="list" size={18} color="#FFF" />
                <Text style={styles.actionKeyText}>Full</Text>
              </Pressable>

              {/* Row 2 */}
              <Pressable style={styles.numKey} onPress={() => handleNumpadPress("4")}>
                <Text style={styles.numKeyText}>4</Text>
              </Pressable>
              <Pressable style={styles.numKey} onPress={() => handleNumpadPress("5")}>
                <Text style={styles.numKeyText}>5</Text>
              </Pressable>
              <Pressable style={styles.numKey} onPress={() => handleNumpadPress("6")}>
                <Text style={styles.numKeyText}>6</Text>
              </Pressable>
              <Pressable
                style={[styles.actionKey, { backgroundColor: "#E67E22" }]}
                onPress={handleSaveOrder}
                disabled={processing || cartItems.length === 0}
              >
                {processing ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <>
                    <Ionicons name="save" size={18} color="#FFF" />
                    <Text style={styles.actionKeyText}>Save</Text>
                  </>
                )}
              </Pressable>
              <Pressable
                style={[styles.actionKey, { backgroundColor: Colors.light.primary }]}
                onPress={handleInvoice}
                disabled={processing || cartItems.length === 0}
              >
                {processing ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <>
                    <Ionicons name="receipt" size={18} color="#FFF" />
                    <Text style={styles.actionKeyText}>Invoice</Text>
                  </>
                )}
              </Pressable>

              {/* Row 3 */}
              <Pressable style={styles.numKey} onPress={() => handleNumpadPress("7")}>
                <Text style={styles.numKeyText}>7</Text>
              </Pressable>
              <Pressable style={styles.numKey} onPress={() => handleNumpadPress("8")}>
                <Text style={styles.numKeyText}>8</Text>
              </Pressable>
              <Pressable style={styles.numKey} onPress={() => handleNumpadPress("9")}>
                <Text style={styles.numKeyText}>9</Text>
              </Pressable>
              <Pressable style={[styles.actionKey, { backgroundColor: Colors.light.danger }]} onPress={handleCancelOrder}>
                <Ionicons name="close" size={18} color="#FFF" />
                <Text style={styles.actionKeyText}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.actionKey, { backgroundColor: "#5A6577" }]}>
                <Ionicons name="card" size={18} color="#FFF" />
                <Text style={styles.actionKeyText}>Credit</Text>
              </Pressable>

              {/* Row 4 */}
              <Pressable style={styles.numKey} onPress={() => handleNumpadPress("Delete")}>
                <Text style={[styles.numKeyText, { fontSize: 13 }]}>Del</Text>
              </Pressable>
              <Pressable style={styles.numKey} onPress={() => handleNumpadPress("0")}>
                <Text style={styles.numKeyText}>0</Text>
              </Pressable>
              <Pressable style={styles.numKey} onPress={() => handleNumpadPress(".")}>
                <Text style={styles.numKeyText}>.</Text>
              </Pressable>
              <Pressable style={[styles.actionKey, { backgroundColor: "#5A6577" }]}>
                <Ionicons name="star" size={18} color="#FFF" />
                <Text style={styles.actionKeyText}>Special</Text>
              </Pressable>
              <Pressable style={[styles.actionKey, { backgroundColor: connectedPrinter ? "#27AE60" : "#5A6577" }]} onPress={() => setShowPrinterModal(true)}>
                <Ionicons name="print" size={18} color="#FFF" />
                <Text style={styles.actionKeyText}>Printer</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>

      {showPrinterModal && (
        <View style={styles.printerModalOverlay}>
          <View style={styles.printerModalBox}>
            <View style={styles.printerModalHeader}>
              <Text style={styles.printerModalTitle}>Printer Settings</Text>
              <Pressable onPress={() => setShowPrinterModal(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </Pressable>
            </View>

            {connectedPrinter ? (
              <View style={styles.printerConnectedBox}>
                <Ionicons name="checkmark-circle" size={24} color="#27AE60" />
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Text style={styles.printerConnectedName}>{connectedPrinter.deviceName}</Text>
                  <Text style={styles.printerConnectedAddr}>{connectedPrinter.macAddress} ({connectedPrinter.type})</Text>
                </View>
                <Pressable style={styles.printerDisconnectBtn} onPress={disconnectPrinter}>
                  <Text style={styles.printerDisconnectText}>Disconnect</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.printerNotConnected}>
                <Ionicons name="print-outline" size={20} color="#999" />
                <Text style={styles.printerNotConnectedText}>No printer connected</Text>
              </View>
            )}

            <View style={{ flexDirection: "row", gap: 8 }}>
              <Pressable
                style={[styles.printerScanBtn, { flex: 1 }, scanning && { opacity: 0.6 }]}
                onPress={scanPrinters}
                disabled={scanning}
              >
                {scanning ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <>
                    <Ionicons name="bluetooth" size={16} color="#FFF" />
                    <Text style={styles.printerScanText}>Scan Bluetooth</Text>
                  </>
                )}
              </Pressable>

              <Pressable
                style={[styles.printerScanBtn, { flex: 1, backgroundColor: "#FF8C00" }, scanning && { opacity: 0.6 }]}
                onPress={scanUsbPrinters}
                disabled={scanning}
              >
                {scanning ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <>
                    <Ionicons name="hardware-chip-outline" size={16} color="#FFF" />
                    <Text style={styles.printerScanText}>Scan USB</Text>
                  </>
                )}
              </Pressable>
            </View>

            {!printerAvailable && !usbAvailable && (
              <Text style={styles.printerWarning}>
                Bluetooth/USB printing requires running on Android device with native build.
              </Text>
            )}

            <ScrollView style={styles.printerListScroll}>
              {printerList.map((device, idx) => (
                <Pressable
                  key={device.macAddress || idx}
                  style={styles.printerDeviceRow}
                  onPress={async () => {
                    const ok = await connectPrinter(device);
                    if (ok) setShowPrinterModal(false);
                  }}
                >
                  <Ionicons name={device.type === "usb" ? "hardware-chip-outline" : "bluetooth"} size={20} color={device.type === "usb" ? "#FF8C00" : Colors.light.primary} />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={styles.printerDeviceName}>{device.deviceName}</Text>
                    <Text style={styles.printerDeviceAddr}>{device.macAddress}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#999" />
                </Pressable>
              ))}
              {printerList.length === 0 && !scanning && (
                <Text style={styles.printerEmptyText}>Tap "Scan Bluetooth" or "Scan USB" to find printers</Text>
              )}
            </ScrollView>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  successOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 100,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  successModal: {
    backgroundColor: "#FFF",
    borderRadius: 16,
    padding: 28,
    alignItems: "center",
    minWidth: 280,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 12,
  },
  successIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.light.success,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  successTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: Colors.light.success,
    marginBottom: 4,
  },
  successBillNo: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: "#333",
    marginBottom: 12,
  },
  successBalanceBox: {
    backgroundColor: "#E8F5E9",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 20,
    alignItems: "center",
    marginBottom: 16,
  },
  successBalanceLabel: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: "#666",
  },
  successBalanceValue: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    color: Colors.light.success,
  },
  successOkBtn: {
    backgroundColor: Colors.light.primary,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 40,
  },
  successOkText: {
    color: "#FFF",
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  mainRow: {
    flex: 1,
    flexDirection: "row",
  },

  // LEFT PANEL
  leftPanel: {
    width: 150,
    backgroundColor: Colors.light.background,
    borderRightWidth: 1,
    borderRightColor: "#9DC5D0",
    paddingTop: 4,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    borderRadius: 6,
    marginHorizontal: 6,
    marginBottom: 6,
    paddingHorizontal: 8,
    height: 36,
    borderWidth: 1,
    borderColor: "#ccc",
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: Colors.light.text,
    marginLeft: 6,
    height: "100%",
    outlineStyle: "none" as any,
  },
  categoryScroll: {
    flex: 1,
    paddingHorizontal: 6,
  },
  categoryBtn: {
    backgroundColor: Colors.light.categoryBg,
    borderRadius: 6,
    paddingVertical: 10,
    paddingHorizontal: 10,
    marginBottom: 4,
    alignItems: "center",
  },
  categoryBtnActive: {
    backgroundColor: Colors.light.categoryActive,
  },
  categoryBtnText: {
    color: "#FFF",
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
  },

  // CENTER PANEL
  centerPanel: {
    flex: 1,
    backgroundColor: Colors.light.primary,
    padding: 6,
  },
  menuGrid: {
    paddingBottom: 20,
  },
  menuRow: {
    gap: 5,
    marginBottom: 5,
  },
  menuItemBtn: {
    flex: 1,
    backgroundColor: "#E0F7FA",
    borderRadius: 6,
    paddingVertical: 10,
    paddingHorizontal: 8,
    minHeight: 60,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#B2DFDB",
  },
  menuItemName: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: "#1A1D26",
    textAlign: "center",
    marginBottom: 2,
  },
  menuItemPrice: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    color: Colors.light.primaryDark,
  },
  menuItemBadge: {
    position: "absolute",
    top: 2,
    right: 2,
    backgroundColor: Colors.light.danger,
    borderRadius: 10,
    width: 20,
    height: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  menuItemBadgeText: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    color: "#FFF",
  },
  loadingCenter: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyMenu: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 100,
  },
  emptyMenuText: {
    color: "#FFF",
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },

  // RIGHT PANEL
  rightPanel: {
    width: 380,
    backgroundColor: Colors.light.panelBg,
    flexDirection: "column",
  },

  // Order Type Tabs
  orderTypeTabs: {
    flexDirection: "row",
    backgroundColor: "#E0E8EC",
    borderBottomWidth: 1,
    borderBottomColor: "#B0BEC5",
  },
  orderTypeTab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    borderRightWidth: 1,
    borderRightColor: "#B0BEC5",
  },
  orderTypeTabActive: {
    backgroundColor: Colors.light.primary,
  },
  orderTypeTabText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: "#444",
  },
  orderTypeTabTextActive: {
    color: "#FFF",
  },

  // Billing Area
  billingArea: {
    flex: 1,
    paddingHorizontal: 8,
    paddingTop: 4,
  },
  scRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  scLabel: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: Colors.light.text,
  },

  // Cart Items
  cartItemsScroll: {
    flex: 1,
    marginVertical: 4,
    backgroundColor: "#FFF",
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#B0BEC5",
    paddingHorizontal: 4,
  },
  cartItemRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#E0E8EC",
    gap: 4,
  },
  cartItemRemove: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.light.danger,
    justifyContent: "center",
    alignItems: "center",
  },
  cartItemName: {
    flex: 1,
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: Colors.light.text,
  },
  cartItemQtyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  cartQtyBtn: {
    width: 22,
    height: 22,
    borderRadius: 4,
    backgroundColor: "#E0F7FA",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#B2DFDB",
  },
  cartQtyText: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    color: Colors.light.text,
    minWidth: 16,
    textAlign: "center",
  },
  cartItemTotal: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.primaryDark,
    minWidth: 65,
    textAlign: "right",
  },

  // Totals
  totalsSection: {
    paddingTop: 4,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 3,
  },
  totalLabel: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.text,
    minWidth: 90,
  },
  totalInput: {
    backgroundColor: "#FFFDE7",
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: Colors.light.text,
    width: 130,
    textAlign: "right",
    height: 30,
  },
  totalInputActive: {
    borderColor: Colors.light.primary,
    borderWidth: 2,
    backgroundColor: "#FFF",
  },

  // Payment Methods
  payMethodRow: {
    flexDirection: "row",
    gap: 12,
    marginVertical: 4,
    paddingHorizontal: 2,
  },
  payCheckRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: "#999",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#FFF",
  },
  checkboxActive: {
    backgroundColor: Colors.light.primary,
    borderColor: Colors.light.primary,
  },
  payCheckLabel: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: Colors.light.text,
  },

  // Numpad Section
  numpadSection: {
    backgroundColor: Colors.light.background,
    padding: 4,
    borderTopWidth: 1,
    borderTopColor: "#9DC5D0",
  },
  numpadGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 3,
  },
  numKey: {
    width: "18.2%",
    aspectRatio: 1.6,
    backgroundColor: "#FFF",
    borderRadius: 4,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#B0BEC5",
  },
  numKeyText: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: "#333",
  },
  actionKey: {
    width: "18.2%",
    aspectRatio: 1.6,
    borderRadius: 4,
    justifyContent: "center",
    alignItems: "center",
    gap: 1,
  },
  actionKeyText: {
    fontSize: 9,
    fontFamily: "Inter_600SemiBold",
    color: "#FFF",
  },

  notesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 3,
    marginTop: 4,
    marginBottom: 4,
  },
  noteItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 1,
  },
  noteMinusBtn: {
    width: 20,
    height: 24,
    borderRadius: 3,
    backgroundColor: Colors.light.danger,
    justifyContent: "center",
    alignItems: "center",
  },
  noteBtn: {
    height: 24,
    paddingHorizontal: 6,
    borderRadius: 3,
    backgroundColor: "#E0F7FA",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#B2DFDB",
  },
  noteBtnText: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    color: Colors.light.primaryDark,
  },
  notePlusBtn: {
    width: 20,
    height: 24,
    borderRadius: 3,
    backgroundColor: Colors.light.success,
    justifyContent: "center",
    alignItems: "center",
  },
  printerModalOverlay: {
    position: "absolute",
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 200,
  },
  printerModalBox: {
    width: 420,
    maxHeight: 500,
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 20,
  },
  printerModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  printerModalTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: "#333",
  },
  printerConnectedBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#E8F5E9",
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  printerConnectedName: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#333",
  },
  printerConnectedAddr: {
    fontSize: 11,
    color: "#777",
    fontFamily: "Inter_400Regular",
  },
  printerDisconnectBtn: {
    backgroundColor: Colors.light.danger,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  printerDisconnectText: {
    color: "#FFF",
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  printerNotConnected: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    backgroundColor: "#F5F5F5",
    borderRadius: 8,
    marginBottom: 12,
  },
  printerNotConnectedText: {
    fontSize: 13,
    color: "#999",
    fontFamily: "Inter_400Regular",
  },
  printerScanBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.light.primary,
    paddingVertical: 10,
    borderRadius: 8,
    marginBottom: 12,
  },
  printerScanText: {
    color: "#FFF",
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  printerWarning: {
    fontSize: 11,
    color: "#E67E22",
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    marginBottom: 8,
    paddingHorizontal: 8,
  },
  printerListScroll: {
    maxHeight: 200,
  },
  printerDeviceRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#EEE",
  },
  printerDeviceName: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: "#333",
  },
  printerDeviceAddr: {
    fontSize: 11,
    color: "#999",
    fontFamily: "Inter_400Regular",
  },
  printerEmptyText: {
    fontSize: 13,
    color: "#999",
    textAlign: "center",
    paddingVertical: 20,
    fontFamily: "Inter_400Regular",
  },
});
