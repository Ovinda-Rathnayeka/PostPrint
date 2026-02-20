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
  const scPercent = scData?.percentage ?? 10;

  const discountPercent = parseFloat(discountRate) || 0;
  const discountAmt = (total * discountPercent) / 100;
  const sc = serviceChargeOn ? (total * scPercent) / 100 : 0;
  const grandTotal = total + sc - discountAmt;
  const cashVal = parseFloat(cashAmount) || 0;
  const balance = payMethod === "Cash" ? cashVal - grandTotal : 0;

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

  const afterOrderSuccess = (billNo: string) => {
    setSuccessBill(billNo);
    resetAll();
    queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
    queryClient.invalidateQueries({ queryKey: ["/api/daily-summary"] });
    if (isNative) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    setTimeout(() => setSuccessBill(null), 5000);
  };

  const buildReceiptHtml = (invoiceData: any) => {
    const { company, invoice, items: invItems, summary } = invoiceData;
    let itemsHtml = "";
    for (const item of invItems) {
      itemsHtml += `<tr><td style="text-align:left">${item.name}</td><td style="text-align:center">${item.qty}</td><td style="text-align:right">${item.price}</td><td style="text-align:right">${item.amt}</td></tr>`;
    }
    return `<html><head><meta name="viewport" content="width=80mm"><style>body{font-family:monospace;font-size:12px;margin:0;padding:4mm;width:72mm}table{width:100%;border-collapse:collapse}td{padding:1px 0}hr{border:none;border-top:1px dashed #000}.center{text-align:center}.right{text-align:right}.bold{font-weight:bold}.big{font-size:16px}</style></head><body><div class="center"><div class="bold big">${company?.name || ""}</div>${company?.address ? `<div>${company.address}</div>` : ""}${company?.email ? `<div>${company.email}</div>` : ""}${company?.phone ? `<div>Tel: ${company.phone}</div>` : ""}</div><hr/><div>Outlet: ${company?.branch || ""}</div><div>Invoice No: ${invoice?.id || ""}</div><div>Date: ${invoice?.date || ""} ${invoice?.time || ""}</div><div>Cashier: ${invoice?.cashier || ""}</div><hr/><table><tr class="bold"><td>Item</td><td style="text-align:center">Qty</td><td style="text-align:right">Price</td><td style="text-align:right">Amount</td></tr>${itemsHtml}</table><hr/><div class="right">Sub Total: ${summary?.subTotal || "0.00"}</div>${summary?.serviceCharge && summary.serviceCharge !== "0.00" ? `<div class="right">Service Charge: ${summary.serviceCharge}</div>` : ""}${summary?.discount && summary.discount !== "0.00" ? `<div class="right">Discount: ${summary.discount}</div>` : ""}<div class="right bold">Grand Total: ${summary?.grandTotal || "0.00"}</div><div class="right">Payment: ${summary?.payment || "0.00"}</div><div class="right">Balance: ${summary?.balance || "0.00"}</div><hr/><div class="center">Thank you, come again !!!</div><div class="center" style="font-size:10px">&copy; MyBiz.lk +94 777721122</div></body></html>`;
  };

  const handleInvoice = async () => {
    if (cartItems.length === 0) return;
    setProcessing(true);
    try {
      const data = await placeOrder();
      if (!data) { setProcessing(false); return; }
      afterOrderSuccess(data.billNo);

      try {
        const invoiceUrl = new URL(`/api/invoice-data/${data.billNo}?branch=${user?.branch || "1"}&username=${user?.username || "admin"}`, getApiUrl());
        const invoiceRes = await fetch(invoiceUrl.toString());
        if (invoiceRes.ok) {
          const invoiceData = await invoiceRes.json();
          const html = buildReceiptHtml(invoiceData);
          await Print.printAsync({ html });
          if (Platform.OS === "android") {
            NavigationBar.setVisibilityAsync("hidden");
            NavigationBar.setBehaviorAsync("overlay-swipe");
            RNStatusBar.setHidden(true);
          }
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
    setProcessing(true);
    try {
      const data = await placeOrder();
      if (!data) { setProcessing(false); return; }
      afterOrderSuccess(data.billNo);
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
        <View style={styles.successBanner}>
          <Ionicons name="checkmark-circle" size={20} color="#FFF" />
          <Text style={styles.successBannerText}>Bill {successBill} created successfully!</Text>
        </View>
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
                key={String(cat.catcode)}
                style={[styles.categoryBtn, selectedCategory === String(cat.catcode) && styles.categoryBtnActive]}
                onPress={() => {
                  setSelectedCategory(String(cat.catcode));
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
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Cash(LKR)</Text>
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
              <Pressable style={[styles.actionKey, { backgroundColor: "#5A6577" }]}>
                <Ionicons name="people" size={18} color="#FFF" />
                <Text style={styles.actionKeyText}>Staff</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  successBanner: {
    position: "absolute",
    top: 50,
    left: "20%",
    right: "20%",
    zIndex: 100,
    backgroundColor: Colors.light.success,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  successBannerText: {
    color: "#FFF",
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
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
});
