-- 1. Wipe out the old views and tables entirely to clear the cache
DROP VIEW IF EXISTS order_summaries CASCADE;
DROP TABLE IF EXISTS order_items CASCADE;
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;

-- 2. Re-create the tables cleanly
CREATE TABLE profiles (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  price DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  user_id UUID REFERENCES auth.users(id)
);

CREATE TABLE orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  total_amount DECIMAL(10,2) NOT NULL,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE order_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id),
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

-- 4. Set up Policies
CREATE POLICY "Anyone can view products" ON products FOR SELECT USING (true);
CREATE POLICY "Authenticated users can insert products" ON products FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Users can update own products" ON products FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own products" ON products FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can view own orders" ON orders FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own orders" ON orders FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own orders" ON orders FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can view own order items" ON order_items FOR SELECT USING (EXISTS (SELECT 1 FROM orders WHERE orders.id = order_items.order_id AND orders.user_id = auth.uid()));
CREATE POLICY "Users can insert own order items" ON order_items FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM orders WHERE orders.id = order_items.order_id AND orders.user_id = auth.uid()));

-- 5. Set up the View explicitly stating table sources to stop Postgres compiler confusion
CREATE OR REPLACE VIEW order_summaries AS
SELECT 
  orders.id AS id,
  orders.user_id AS user_id,
  orders.status AS status,
  orders.created_at AS created_at,
  orders.total_amount AS total_amount,
  COUNT(order_items.id) AS item_count,
  profiles.email AS user_email
FROM orders
LEFT JOIN order_items ON orders.id = order_items.order_id
LEFT JOIN profiles ON orders.user_id = profiles.id
GROUP BY orders.id, orders.user_id, orders.status, orders.created_at, orders.total_amount, profiles.email;

-- 6. Insert sample search testing data
INSERT INTO products (name, description, price, user_id) VALUES 
  ('AeroGlide Wireless Mouse', 'Ergonomic 2.4GHz wireless optical mouse with adjustable DPI and silent clicks.', 24.99, NULL),
  ('QuantumBass Bluetooth Headphones', 'Over-ear noise-canceling headphones with high-fidelity sound and 40-hour battery life.', 129.99, NULL),
  ('LuminaReal 4K Gaming Monitor', '27-inch Ultra HD IPS display featuring a 144Hz refresh rate and AMD FreeSync.', 349.50, NULL),
  ('ApexType Mechanical Keyboard', 'Compact tenkeyless wired keyboard with hot-swappable tactile blue switches and RGB lighting.', 79.95, NULL),
  ('OmniCharge 7-in-1 USB-C Hub', 'Aluminum multiport adapter with 4K HDMI, SD card reader, and 100W Power Delivery.', 39.99, NULL),
  ('HydroShield Waterproof Backpack', 'Durable 30L commuter travel bag with a dedicated 16-inch padded laptop compartment.', 64.00, NULL),
  ('TitanCore Portable SSD 1TB', 'Ultra-fast external solid-state drive with USB 3.2 Gen 2 interface and rugged shell.', 95.00, NULL),
  ('VividStream 1080p Webcam', 'Full HD web camera with dual noise-reducing microphones and automatic low-light correction.', 45.99, NULL),
  ('MagHold Magnetic Car Mount', 'Universal air vent dashboard phone holder compatible with MagSafe accessories.', 19.99, NULL),
  ('SolarPulse Outdoor Power Bank', '20000mAh rugged backup battery bank with built-in solar panels and dual flashlights.', 32.50, NULL),
  ('FlexiStand Adjustable Desk Converter', 'Sit-to-stand gas spring tabletop riser with a wide removable keyboard tray floor.', 149.00, NULL),
  ('GigaWave Wi-Fi 6 Router', 'Dual-band gigabit wireless internet router with 4 high-gain antennas for smart homes.', 89.99, NULL),
  ('ClearVoice Studio Microphone', 'Cardioid USB condenser mic with pop filter and shock mount for streaming and podcasting.', 69.95, NULL),
  ('NeonGlow Smart LED Desk Lamp', 'Dimmable office table lamp with wireless smartphone charging pad and touch controls.', 42.00, NULL),
  ('CronoFit Smart Sports Watch', 'Waterproof fitness tracker with heart rate monitor, sleep tracking, and blood oxygen alerts.', 59.99, NULL);
