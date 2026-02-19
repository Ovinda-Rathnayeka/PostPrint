# POS System - Restaurant Point of Sale

## Overview
A tablet-optimized POS (Point of Sale) system built with Expo React Native and Express backend. Connects to an existing MySQL database (from PHP POS system) to manage restaurant operations including menu items, orders, billing, and payments. Features an all-in-one 3-column layout matching the PHP web POS system.

## Architecture
- **Frontend**: Expo React Native with file-based routing (Expo Router)
- **Backend**: Express.js with MySQL connection (mysql2)
- **Database**: External MySQL database at 74.50.67.3 (csquaref_villagebakerytest)
- **State Management**: React Context (AuthContext, CartContext) + React Query
- **Auth**: Hardcoded admin/admin login (no database auth)
- **Layout**: All-in-one 3-column tablet layout (no tab navigation)

## Key Features
- Hardcoded admin/admin login credentials
- 3-column all-in-one POS screen: left (categories), center (menu grid), right (billing/numpad)
- Menu categories and items browsing with search
- Categories sorted by `catorder` field (matching PHP system)
- Cart/order management with quantity controls
- Payment processing (Cash, Card, CardandCash split)
- Percentage-based discount (matching PHP's discount-rate approach)
- Dynamic service charge from `vat_type` table (not hardcoded)
- Bank name and card reference for card payments
- Invoice generation with CT-prefix bill numbers
- Integrated number pad for quick data entry
- Action buttons (Home, Full, KOT, Invoice, Cancel, Credit, Special, Staff)
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
  _layout.tsx          - Root layout with providers (Stack navigation)
  index.tsx            - Login screen
  pos.tsx              - All-in-one POS screen (3-column tablet layout)
  orders.tsx           - Order history + daily summary (modal)
  order-detail.tsx     - Order detail screen
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
  colors.ts            - Theme colors (teal/cyan theme matching PHP system)
```

## Color Theme
- Background: #87CEEB (light blue)
- Primary: #00A89D (teal)
- Primary Dark: #008C82
- Panel Background: #B0E0E6 (powder blue)
- Menu items: #E0F7FA (light cyan cards)

## Workflows
- **Start Backend**: `npm run server:dev` - Express server on port 5000
- **Start Frontend**: `npm run expo:dev` - Expo dev server on port 8081
