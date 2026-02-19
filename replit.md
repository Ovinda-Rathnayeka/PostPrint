# POS System - Restaurant Point of Sale

## Overview
A mobile POS (Point of Sale) system built with Expo React Native and Express backend. Connects to an existing MySQL database to manage restaurant operations including menu items, orders, billing, and payments.

## Architecture
- **Frontend**: Expo React Native with file-based routing (Expo Router)
- **Backend**: Express.js with MySQL connection (mysql2)
- **Database**: External MySQL database (user provides connection details)
- **State Management**: React Context (AuthContext, CartContext) + React Query

## Key Features
- User login against MySQL users table
- Menu categories and items browsing with search
- Cart/order management with quantity controls
- Payment processing (Cash, Card, Split payment)
- Discount and service charge (10%) support
- Invoice generation with bill numbers (CT format)
- Daily sales summary dashboard
- Order history with detail view
- MySQL connection testing

## Database Tables Used
- `users` - User authentication
- `menu_category` - Menu categories
- `menu_master` - Menu items with prices
- `nista_bill_summary` - Bill/invoice summaries
- `nista_bill_master` - Bill line items
- `nista_pay_voucher` - Payment vouchers
- `invoicesummry` - Invoice summary
- `recipt` - Receipts
- `monycolection` - Money collection
- `stock_master` - Stock tracking
- `companydetails` - Company info
- `customer` - Customer records

## Environment Variables
- `MYSQL_HOST` - MySQL server IP address
- `MYSQL_PORT` - MySQL port (default: 3306)
- `MYSQL_USER` - MySQL username
- `MYSQL_PASSWORD` - MySQL password
- `MYSQL_DATABASE` - MySQL database name

## Project Structure
```
app/
  _layout.tsx          - Root layout with providers
  index.tsx            - Login screen
  payment.tsx          - Payment modal screen
  order-detail.tsx     - Order detail screen
  (tabs)/
    _layout.tsx        - Tab layout (POS, Orders, Settings)
    index.tsx          - POS screen (menu + cart)
    orders.tsx         - Order history + daily summary
    settings.tsx       - Settings + DB connection test
lib/
  AuthContext.tsx       - Authentication state
  CartContext.tsx       - Cart/order state
  query-client.ts      - API client configuration
server/
  index.ts             - Express server setup
  routes.ts            - API routes
  db.ts                - MySQL connection pool
  storage.ts           - In-memory storage (legacy)
constants/
  colors.ts            - Theme colors
```

## Workflows
- **Start Backend**: `npm run server:dev` - Express server on port 5000
- **Start Frontend**: `npm run expo:dev` - Expo dev server on port 8081
