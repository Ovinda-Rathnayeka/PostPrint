import React, { createContext, useContext, useState, useMemo, useCallback, ReactNode } from "react";

export interface CartItem {
  code: string;
  name: string;
  price: number;
  qty: number;
}

interface CartContextValue {
  items: CartItem[];
  addItem: (code: string, name: string, price: number) => void;
  removeItem: (code: string) => void;
  updateQty: (code: string, qty: number) => void;
  clearCart: () => void;
  total: number;
  itemCount: number;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  const addItem = useCallback((code: string, name: string, price: number) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.code === code);
      if (existing) {
        return prev.map((i) => (i.code === code ? { ...i, qty: i.qty + 1 } : i));
      }
      return [...prev, { code, name, price, qty: 1 }];
    });
  }, []);

  const removeItem = useCallback((code: string) => {
    setItems((prev) => prev.filter((i) => i.code !== code));
  }, []);

  const updateQty = useCallback((code: string, qty: number) => {
    if (qty <= 0) {
      setItems((prev) => prev.filter((i) => i.code !== code));
    } else {
      setItems((prev) => prev.map((i) => (i.code === code ? { ...i, qty } : i)));
    }
  }, []);

  const clearCart = useCallback(() => setItems([]), []);

  const total = useMemo(() => items.reduce((sum, i) => sum + i.price * i.qty, 0), [items]);
  const itemCount = useMemo(() => items.reduce((sum, i) => sum + i.qty, 0), [items]);

  const value = useMemo(
    () => ({ items, addItem, removeItem, updateQty, clearCart, total, itemCount }),
    [items, addItem, removeItem, updateQty, clearCart, total, itemCount]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
