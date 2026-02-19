import React, { useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  Platform,
  Alert,
  KeyboardAvoidingView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/AuthContext";
import { useCart } from "@/lib/CartContext";
import { apiRequest } from "@/lib/query-client";
import { queryClient } from "@/lib/query-client";

type PaymentMethod = "Cash" | "Card" | "CardandCash";

export default function PaymentScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { items, total, clearCart } = useCart();
  const [payMethod, setPayMethod] = useState<PaymentMethod>("Cash");
  const [discount, setDiscount] = useState("");
  const [serviceCharge, setServiceCharge] = useState(false);
  const [cashAmount, setCashAmount] = useState("");
  const [cardAmount, setCardAmount] = useState("");
  const [cardRef, setCardRef] = useState("");
  const [processing, setProcessing] = useState(false);
  const [success, setSuccess] = useState(false);
  const [billNo, setBillNo] = useState("");

  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 34 : 0;

  const discountAmt = parseFloat(discount) || 0;
  const sc = serviceCharge ? (total * 10) / 100 : 0;
  const grandTotal = total + sc - discountAmt;
  const cashVal = parseFloat(cashAmount) || 0;
  const balance = payMethod === "Cash" ? cashVal - grandTotal : 0;

  const handlePay = async () => {
    if (items.length === 0) return;
    if (payMethod === "Cash" && cashVal < grandTotal) {
      if (Platform.OS === "web") {
        alert("Cash amount must be equal to or greater than the total");
      } else {
        Alert.alert("Insufficient Amount", "Cash amount must be equal to or greater than the total");
      }
      return;
    }

    setProcessing(true);
    try {
      const res = await apiRequest("POST", "/api/place-order", {
        items: items.map((i) => ({ code: i.code, name: i.name, price: i.price, qty: i.qty })),
        total,
        discount: discountAmt,
        serviceCharge,
        paytype: payMethod,
        cash: cashVal,
        card: parseFloat(cardAmount) || 0,
        cardRef,
        userId: user?.id || "1",
        branch: user?.branch || "1",
        customer: "counter",
      });
      const data = await res.json();
      setBillNo(data.billNo);
      setSuccess(true);
      clearCart();
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/daily-summary"] });
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (err: any) {
      const msg = err.message || "Failed to process payment";
      if (Platform.OS === "web") {
        alert(msg);
      } else {
        Alert.alert("Payment Failed", msg);
      }
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    } finally {
      setProcessing(false);
    }
  };

  if (success) {
    return (
      <View style={[styles.container, styles.successContainer, { paddingTop: insets.top + webTopInset }]}>
        <View style={styles.successContent}>
          <View style={styles.successCircle}>
            <Ionicons name="checkmark" size={48} color="#FFF" />
          </View>
          <Text style={styles.successTitle}>Payment Successful</Text>
          <Text style={styles.successBillNo}>Bill No: {billNo}</Text>
          <Text style={styles.successAmount}>Rs. {grandTotal.toFixed(2)}</Text>

          <Pressable
            style={({ pressed }) => [styles.doneBtn, pressed && { opacity: 0.9 }]}
            onPress={() => router.back()}
          >
            <Text style={styles.doneBtnText}>Done</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top + webTopInset }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={90}
    >
      <View style={styles.modalHeader}>
        <Pressable onPress={() => router.back()} style={styles.closeBtn}>
          <Ionicons name="close" size={24} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.modalTitle}>Payment</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + webBottomInset + 20 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.summaryBox}>
          <View style={styles.summaryLine}>
            <Text style={styles.summaryLabel}>Subtotal ({items.length} items)</Text>
            <Text style={styles.summaryValue}>Rs. {total.toFixed(2)}</Text>
          </View>
          {sc > 0 && (
            <View style={styles.summaryLine}>
              <Text style={styles.summaryLabel}>Service Charge (10%)</Text>
              <Text style={styles.summaryValue}>Rs. {sc.toFixed(2)}</Text>
            </View>
          )}
          {discountAmt > 0 && (
            <View style={styles.summaryLine}>
              <Text style={[styles.summaryLabel, { color: Colors.light.danger }]}>Discount</Text>
              <Text style={[styles.summaryValue, { color: Colors.light.danger }]}>-Rs. {discountAmt.toFixed(2)}</Text>
            </View>
          )}
          <View style={[styles.summaryLine, styles.totalLine]}>
            <Text style={styles.totalLabel}>Grand Total</Text>
            <Text style={styles.totalValue}>Rs. {grandTotal.toFixed(2)}</Text>
          </View>
        </View>

        <Text style={styles.fieldLabel}>Service Charge</Text>
        <Pressable
          style={styles.toggleRow}
          onPress={() => {
            setServiceCharge(!serviceCharge);
            if (Platform.OS !== "web") Haptics.selectionAsync();
          }}
        >
          <Text style={styles.toggleLabel}>Add 10% service charge</Text>
          <View style={[styles.toggle, serviceCharge && styles.toggleActive]}>
            <View style={[styles.toggleDot, serviceCharge && styles.toggleDotActive]} />
          </View>
        </Pressable>

        <Text style={styles.fieldLabel}>Discount Amount</Text>
        <View style={styles.inputRow}>
          <Text style={styles.inputPrefix}>Rs.</Text>
          <TextInput
            style={styles.inputField}
            placeholder="0.00"
            placeholderTextColor={Colors.light.textSecondary}
            value={discount}
            onChangeText={setDiscount}
            keyboardType="numeric"
          />
        </View>

        <Text style={styles.fieldLabel}>Payment Method</Text>
        <View style={styles.payMethodRow}>
          {(["Cash", "Card", "CardandCash"] as PaymentMethod[]).map((method) => (
            <Pressable
              key={method}
              style={[styles.payMethodBtn, payMethod === method && styles.payMethodBtnActive]}
              onPress={() => {
                setPayMethod(method);
                if (Platform.OS !== "web") Haptics.selectionAsync();
              }}
            >
              <Ionicons
                name={method === "Cash" ? "cash" : method === "Card" ? "card" : "wallet"}
                size={20}
                color={payMethod === method ? "#FFF" : Colors.light.primary}
              />
              <Text style={[styles.payMethodText, payMethod === method && styles.payMethodTextActive]}>
                {method === "CardandCash" ? "Split" : method}
              </Text>
            </Pressable>
          ))}
        </View>

        {(payMethod === "Cash" || payMethod === "CardandCash") && (
          <>
            <Text style={styles.fieldLabel}>Cash Amount</Text>
            <View style={styles.inputRow}>
              <Text style={styles.inputPrefix}>Rs.</Text>
              <TextInput
                style={styles.inputField}
                placeholder="0.00"
                placeholderTextColor={Colors.light.textSecondary}
                value={cashAmount}
                onChangeText={setCashAmount}
                keyboardType="numeric"
              />
            </View>
          </>
        )}

        {(payMethod === "Card" || payMethod === "CardandCash") && (
          <>
            {payMethod === "CardandCash" && (
              <>
                <Text style={styles.fieldLabel}>Card Amount</Text>
                <View style={styles.inputRow}>
                  <Text style={styles.inputPrefix}>Rs.</Text>
                  <TextInput
                    style={styles.inputField}
                    placeholder="0.00"
                    placeholderTextColor={Colors.light.textSecondary}
                    value={cardAmount}
                    onChangeText={setCardAmount}
                    keyboardType="numeric"
                  />
                </View>
              </>
            )}
            <Text style={styles.fieldLabel}>Card Reference</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={[styles.inputField, { paddingLeft: 14 }]}
                placeholder="Enter card reference number"
                placeholderTextColor={Colors.light.textSecondary}
                value={cardRef}
                onChangeText={setCardRef}
              />
            </View>
          </>
        )}

        {payMethod === "Cash" && cashVal >= grandTotal && (
          <View style={styles.balanceBox}>
            <Text style={styles.balanceLabel}>Balance</Text>
            <Text style={styles.balanceValue}>Rs. {balance.toFixed(2)}</Text>
          </View>
        )}

        <Pressable
          style={({ pressed }) => [styles.confirmBtn, pressed && { opacity: 0.9 }, processing && { opacity: 0.7 }]}
          onPress={handlePay}
          disabled={processing}
        >
          {processing ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={22} color="#FFF" />
              <Text style={styles.confirmBtnText}>Confirm Payment - Rs. {grandTotal.toFixed(2)}</Text>
            </>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  successContainer: {
    justifyContent: "center",
    alignItems: "center",
  },
  successContent: {
    alignItems: "center",
    gap: 12,
  },
  successCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.light.success,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  successTitle: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    color: Colors.light.text,
  },
  successBillNo: {
    fontSize: 16,
    fontFamily: "Inter_500Medium",
    color: Colors.light.textSecondary,
  },
  successAmount: {
    fontSize: 32,
    fontFamily: "Inter_700Bold",
    color: Colors.light.primary,
    marginVertical: 8,
  },
  doneBtn: {
    backgroundColor: Colors.light.primary,
    paddingHorizontal: 48,
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 20,
  },
  doneBtnText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: "#FFF",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  closeBtn: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.text,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  summaryBox: {
    backgroundColor: Colors.light.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Colors.light.borderLight,
  },
  summaryLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
  },
  summaryLabel: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textSecondary,
  },
  summaryValue: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: Colors.light.text,
  },
  totalLine: {
    borderTopWidth: 1,
    borderTopColor: Colors.light.border,
    marginTop: 8,
    paddingTop: 12,
  },
  totalLabel: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.text,
  },
  totalValue: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: Colors.light.primary,
  },
  fieldLabel: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.text,
    marginBottom: 8,
  },
  toggleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.light.borderLight,
  },
  toggleLabel: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.light.text,
  },
  toggle: {
    width: 48,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.light.border,
    padding: 2,
    justifyContent: "center",
  },
  toggleActive: {
    backgroundColor: Colors.light.primary,
  },
  toggleDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#FFF",
  },
  toggleDotActive: {
    alignSelf: "flex-end",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.light.border,
    marginBottom: 16,
    height: 48,
  },
  inputPrefix: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: Colors.light.textSecondary,
    paddingLeft: 14,
    paddingRight: 4,
  },
  inputField: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    color: Colors.light.text,
    height: "100%",
    paddingRight: 14,
  },
  payMethodRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 20,
  },
  payMethodBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: Colors.light.categoryBg,
    borderWidth: 1,
    borderColor: "transparent",
  },
  payMethodBtnActive: {
    backgroundColor: Colors.light.primary,
    borderColor: Colors.light.primaryDark,
  },
  payMethodText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.primary,
  },
  payMethodTextActive: {
    color: "#FFF",
  },
  balanceBox: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: Colors.light.success + "15",
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Colors.light.success + "30",
  },
  balanceLabel: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.success,
  },
  balanceValue: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: Colors.light.success,
  },
  confirmBtn: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.light.primary,
    borderRadius: 14,
    height: 52,
    marginTop: 4,
    shadowColor: Colors.light.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  confirmBtnText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: "#FFF",
  },
});
