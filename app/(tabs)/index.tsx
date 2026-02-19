import React, { useState, useCallback } from "react";
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
  RefreshControl,
} from "react-native";
import { Ionicons, Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/AuthContext";
import { useCart } from "@/lib/CartContext";
import { getApiUrl } from "@/lib/query-client";

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

export default function POSScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const { user } = useAuth();
  const { items: cartItems, addItem, removeItem, updateQty, total, itemCount, clearCart } = useCart();
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [searchText, setSearchText] = useState("");
  const [showCart, setShowCart] = useState(false);

  const webTopInset = Platform.OS === "web" ? 67 : 0;

  const { data: categories = [], isLoading: catLoading } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });

  const { data: menuItems = [], isLoading: menuLoading, refetch } = useQuery<MenuItem[]>({
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

  const handleAddItem = useCallback((item: MenuItem) => {
    addItem(String(item.menucode), item.menuname, Number(item.sellingprice));
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [addItem]);

  const renderCategory = useCallback(({ item }: { item: Category | { catcode: string; catname: string } }) => {
    const isActive = selectedCategory === String(item.catcode);
    return (
      <Pressable
        style={[styles.categoryChip, isActive && styles.categoryChipActive]}
        onPress={() => {
          setSelectedCategory(String(item.catcode));
          if (Platform.OS !== "web") Haptics.selectionAsync();
        }}
      >
        <Text style={[styles.categoryText, isActive && styles.categoryTextActive]}>{item.catname}</Text>
      </Pressable>
    );
  }, [selectedCategory]);

  const renderMenuItem = useCallback(({ item }: { item: MenuItem }) => {
    const cartItem = cartItems.find((c) => c.code === String(item.menucode));
    return (
      <Pressable
        style={({ pressed }) => [styles.menuCard, pressed && styles.menuCardPressed]}
        onPress={() => handleAddItem(item)}
        testID={`menu-item-${item.menucode}`}
      >
        <View style={styles.menuCardIcon}>
          <Ionicons name="fast-food" size={24} color={Colors.light.primary} />
        </View>
        <View style={styles.menuCardInfo}>
          <Text style={styles.menuCardName} numberOfLines={2}>{item.menuname}</Text>
          <Text style={styles.menuCardPrice}>Rs. {Number(item.sellingprice).toFixed(2)}</Text>
        </View>
        {cartItem ? (
          <View style={styles.menuCardBadge}>
            <Text style={styles.menuCardBadgeText}>{cartItem.qty}</Text>
          </View>
        ) : (
          <View style={styles.menuCardAdd}>
            <Ionicons name="add" size={20} color={Colors.light.primary} />
          </View>
        )}
      </Pressable>
    );
  }, [cartItems, handleAddItem]);

  const allCategories = [{ catcode: "all", catname: "All Items" } as any, ...categories];

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Welcome back,</Text>
          <Text style={styles.userName}>{user?.name || "User"}</Text>
        </View>
        <Pressable
          style={styles.cartButton}
          onPress={() => setShowCart(!showCart)}
          testID="cart-toggle"
        >
          <Ionicons name="cart" size={24} color={Colors.light.primary} />
          {itemCount > 0 && (
            <View style={styles.cartBadge}>
              <Text style={styles.cartBadgeText}>{itemCount}</Text>
            </View>
          )}
        </Pressable>
      </View>

      <View style={styles.searchBar}>
        <Feather name="search" size={18} color={Colors.light.textSecondary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search menu items..."
          placeholderTextColor={Colors.light.textSecondary}
          value={searchText}
          onChangeText={setSearchText}
          testID="search-input"
        />
        {searchText ? (
          <Pressable onPress={() => setSearchText("")}>
            <Ionicons name="close-circle" size={18} color={Colors.light.textSecondary} />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.categorySection}>
        <FlatList
          data={allCategories}
          renderItem={renderCategory}
          keyExtractor={(item) => String(item.catcode)}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryList}
        />
      </View>

      {showCart && cartItems.length > 0 ? (
        <View style={[styles.cartPanel, { marginBottom: tabBarHeight + 8 }]}>
          <View style={styles.cartHeader}>
            <Text style={styles.cartTitle}>Current Order</Text>
            <Pressable onPress={clearCart}>
              <Text style={styles.clearText}>Clear All</Text>
            </Pressable>
          </View>
          <ScrollView style={styles.cartScroll} showsVerticalScrollIndicator={false}>
            {cartItems.map((ci) => (
              <View key={ci.code} style={styles.cartItem}>
                <View style={styles.cartItemInfo}>
                  <Text style={styles.cartItemName} numberOfLines={1}>{ci.name}</Text>
                  <Text style={styles.cartItemPrice}>Rs. {(ci.price * ci.qty).toFixed(2)}</Text>
                </View>
                <View style={styles.qtyControls}>
                  <Pressable
                    style={styles.qtyBtn}
                    onPress={() => {
                      updateQty(ci.code, ci.qty - 1);
                      if (Platform.OS !== "web") Haptics.selectionAsync();
                    }}
                  >
                    <Ionicons name="remove" size={16} color={Colors.light.primary} />
                  </Pressable>
                  <Text style={styles.qtyText}>{ci.qty}</Text>
                  <Pressable
                    style={styles.qtyBtn}
                    onPress={() => {
                      updateQty(ci.code, ci.qty + 1);
                      if (Platform.OS !== "web") Haptics.selectionAsync();
                    }}
                  >
                    <Ionicons name="add" size={16} color={Colors.light.primary} />
                  </Pressable>
                </View>
              </View>
            ))}
          </ScrollView>
          <View style={styles.cartFooter}>
            <View style={styles.cartTotal}>
              <Text style={styles.cartTotalLabel}>Total</Text>
              <Text style={styles.cartTotalValue}>Rs. {total.toFixed(2)}</Text>
            </View>
            <Pressable
              style={({ pressed }) => [styles.payBtn, pressed && { opacity: 0.9 }]}
              onPress={() => {
                router.push("/payment");
                if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              }}
              testID="pay-button"
            >
              <Ionicons name="card" size={20} color="#FFF" />
              <Text style={styles.payBtnText}>Pay Now</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <FlatList
          data={menuItems}
          renderItem={renderMenuItem}
          keyExtractor={(item) => String(item.menucode)}
          numColumns={2}
          columnWrapperStyle={styles.menuRow}
          contentContainerStyle={[styles.menuList, { paddingBottom: tabBarHeight + 80 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={false} onRefresh={() => refetch()} />}
          ListEmptyComponent={
            menuLoading ? (
              <View style={styles.emptyState}>
                <ActivityIndicator size="large" color={Colors.light.primary} />
                <Text style={styles.emptyText}>Loading menu...</Text>
              </View>
            ) : (
              <View style={styles.emptyState}>
                <Ionicons name="restaurant-outline" size={48} color={Colors.light.textSecondary} />
                <Text style={styles.emptyTitle}>No Items Found</Text>
                <Text style={styles.emptyText}>
                  {searchText ? "Try a different search term" : "Connect to your database to load menu items"}
                </Text>
              </View>
            )
          }
        />
      )}

      {!showCart && itemCount > 0 && (
        <Pressable
          style={[styles.floatingCart, { bottom: tabBarHeight + 16 }]}
          onPress={() => setShowCart(true)}
          testID="floating-cart"
        >
          <View style={styles.floatingCartLeft}>
            <Ionicons name="cart" size={22} color="#FFF" />
            <Text style={styles.floatingCartCount}>{itemCount} items</Text>
          </View>
          <Text style={styles.floatingCartTotal}>Rs. {total.toFixed(2)}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  greeting: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textSecondary,
  },
  userName: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: Colors.light.text,
  },
  cartButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: Colors.light.surface,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  cartBadge: {
    position: "absolute",
    top: 4,
    right: 4,
    backgroundColor: Colors.light.danger,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 4,
  },
  cartBadgeText: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    color: "#FFF",
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.light.surface,
    borderRadius: 14,
    marginHorizontal: 20,
    paddingHorizontal: 14,
    height: 44,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.light.text,
    marginLeft: 10,
    height: "100%",
  },
  categorySection: {
    marginBottom: 8,
  },
  categoryList: {
    paddingHorizontal: 20,
    gap: 8,
  },
  categoryChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.light.categoryBg,
  },
  categoryChipActive: {
    backgroundColor: Colors.light.categoryActive,
  },
  categoryText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: Colors.light.categoryText,
  },
  categoryTextActive: {
    color: "#FFF",
  },
  menuList: {
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  menuRow: {
    gap: 10,
    marginBottom: 10,
  },
  menuCard: {
    flex: 1,
    backgroundColor: Colors.light.surface,
    borderRadius: 16,
    padding: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
    borderWidth: 1,
    borderColor: Colors.light.borderLight,
  },
  menuCardPressed: {
    transform: [{ scale: 0.97 }],
    opacity: 0.9,
  },
  menuCardIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.light.categoryBg,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 10,
  },
  menuCardInfo: {
    flex: 1,
    marginBottom: 8,
  },
  menuCardName: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.text,
    marginBottom: 4,
  },
  menuCardPrice: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    color: Colors.light.primary,
  },
  menuCardBadge: {
    position: "absolute",
    top: 10,
    right: 10,
    backgroundColor: Colors.light.primary,
    borderRadius: 12,
    width: 24,
    height: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  menuCardBadgeText: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    color: "#FFF",
  },
  menuCardAdd: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: Colors.light.categoryBg,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 80,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.text,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textSecondary,
    textAlign: "center",
    paddingHorizontal: 40,
  },
  cartPanel: {
    flex: 1,
    backgroundColor: Colors.light.surface,
    marginHorizontal: 16,
    borderRadius: 20,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  cartHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  cartTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: Colors.light.text,
  },
  clearText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: Colors.light.danger,
  },
  cartScroll: {
    flex: 1,
  },
  cartItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.borderLight,
  },
  cartItemInfo: {
    flex: 1,
    marginRight: 12,
  },
  cartItemName: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: Colors.light.text,
  },
  cartItemPrice: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.primary,
    marginTop: 2,
  },
  qtyControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  qtyBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: Colors.light.categoryBg,
    justifyContent: "center",
    alignItems: "center",
  },
  qtyText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.text,
    minWidth: 20,
    textAlign: "center",
  },
  cartFooter: {
    borderTopWidth: 1,
    borderTopColor: Colors.light.border,
    paddingTop: 12,
    gap: 12,
  },
  cartTotal: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cartTotalLabel: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.text,
  },
  cartTotalValue: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: Colors.light.primary,
  },
  payBtn: {
    flexDirection: "row",
    backgroundColor: Colors.light.primary,
    borderRadius: 14,
    height: 50,
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    shadowColor: Colors.light.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  payBtnText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: "#FFF",
  },
  floatingCart: {
    position: "absolute",
    left: 20,
    right: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: Colors.light.primary,
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 14,
    shadowColor: Colors.light.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  floatingCartLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  floatingCartCount: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#FFF",
  },
  floatingCartTotal: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: "#FFF",
  },
});
