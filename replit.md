# POS System - Restaurant Point of Sale

## Overview
A mobile POS (Point of Sale) system built with Expo React Native and Express backend. Connects to an existing MySQL database (from PHP POS system) to manage restaurant operations including menu items, orders, billing, and payments.

## Architecture
- **Frontend**: Expo React Native with file-based routing (Expo Router)
- **Backend**: Express.js with MySQL connection (mysql2)
- **Database**: External MySQL database at 74.50.67.3 (csquaref_villagebakerytest)
- **State Management**: React Context (AuthContext, CartContext) + React Query
- **Auth**: Hardcoded admin/admin login (no database auth)

## Key Features
- Hardcoded admin/admin login credentials
- Menu categories and items browsing with search
- Categories sorted by `catorder` field (matching PHP system)
- Cart/order management with quantity controls
- Payment processing (Cash, Card, CardandCash split)
- Percentage-based discount (matching PHP's discount-rate approach)
- Dynamic service charge from `vat_type` table (not hardcoded)
- Bank name and card reference for card payments
- Invoice generation with CT-prefix bill numbers
- Daily sales summary dashboard
- Order history with detail view

## Database Column Mappings (Critical)
### menu_category table
- `id`, `catcode` (number), `category` (name - aliased as catname), `catorder`, `active`

### menu_master table
- `menucode` (number), `menuname`, `mprice` (selling price - aliased as sellingprice)
- `costprice`, `menucat` (category id), `menucat1` (category code - aliased as category)
- `active`, `cookm`, `sauce`, `itemname`, `quantity`

### vat_type table
- `vat_type` (e.g., 'service_charge'), `precentage_value` (service charge %)

### Bill tables
- `nista_bill_master` - Bill line items (billno, icode, iname, quantity, uprice, amount)
- `nista_bill_summary` - Bill summaries with disctype, discper, servicecharge fields
- `nista_pay_voucher` - Payment vouchers with card_reference_no
- `invoicesummry` - Invoice summary
- `recipt` - Receipts
- `monycolection` - Money collection with bankname, cardref

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
