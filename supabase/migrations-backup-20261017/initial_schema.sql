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
-- 1. Add the image_url column to your products table
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS image_url TEXT DEFAULT 'https://unsplash.com';

-- 2. Update the sample rows with real, high-quality Unsplash image URLs for your search queries
UPDATE products SET image_url = 'https://unsplash.com' WHERE name LIKE '%iPhone 15%';
UPDATE products SET image_url = 'https://unsplash.com' WHERE name LIKE '%Samsung Galaxy S24%';
UPDATE products SET image_url = 'https://unsplash.com' WHERE name LIKE '%MacBook%';
UPDATE products SET image_url = 'https://unsplash.com' WHERE name LIKE '%Dell XPS%';
UPDATE products SET image_url = 'https://unsplash.com' WHERE name LIKE '%iPad Pro%';
UPDATE products SET image_url = 'https://unsplash.com' WHERE name LIKE '%PlayStation%';
UPDATE products SET image_url = 'https://unsplash.com' WHERE name LIKE '%Xbox%';
UPDATE products SET image_url = 'https://unsplash.com' WHERE name LIKE '%Nintendo Switch%';
UPDATE products SET image_url = 'https://unsplash.com' WHERE name LIKE '%Steam Deck%';
UPDATE products SET image_url = 'https://unsplash.com' WHERE name LIKE '%ROG Ally%';
UPDATE products SET image_url = 'https://unsplash.com' WHERE name LIKE '%Mouse%' OR name LIKE '%DeathAdder%' OR name LIKE '%Superlight%';
UPDATE products SET image_url = 'https://unsplash.com' WHERE name LIKE '%Keyboard%' OR name LIKE '%Platinum%';
UPDATE products SET image_url = 'https://unsplash.com' WHERE name LIKE '%Headphones%' OR name LIKE '%WH-1000XM5%';
UPDATE products SET image_url = 'https://unsplash.com' WHERE name LIKE '%Headset%' OR name LIKE '%Arctis%' OR name LIKE '%Cloud Alpha%';
UPDATE products SET image_url = 'https://unsplash.com' WHERE name LIKE '%Echo%' OR name LIKE '%Nest Hub%' OR name LIKE '%HomePod%';
UPDATE products SET image_url = 'https://unsplash.com' WHERE name LIKE '%Doorbell%' OR name LIKE '%Thermostat%';
UPDATE products SET image_url = 'https://unsplash.com' WHERE name LIKE '%Watch%' OR name LIKE '%Sense 2%' OR name LIKE '%Fenix%';
UPDATE products SET image_url = 'https://unsplash.com' WHERE name LIKE '%Ring%';
UPDATE products SET image_url = 'https://unsplash.com' WHERE name LIKE '%Earbuds%' OR name LIKE '%AirPods%';
UPDATE products SET image_url = 'https://unsplash.com' WHERE name LIKE '%Speaker%' OR name LIKE '%Acton%' OR name LIKE '%Xtreme%';
UPDATE products SET image_url = 'https://unsplash.com' WHERE name LIKE '%Canon%' OR name LIKE '%Sony Alpha%';
UPDATE products SET image_url = 'https://unsplash.com' WHERE name LIKE '%Mini 4 Pro%';


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
-- Electronics - Premium Tech
('iPhone 15 Pro Max 1TB', 'The ultimate iPhone with titanium design, A17 Pro chip, and professional camera system. Perfect for creators and professionals.', 1599.99, NULL),
('Samsung Galaxy S24 Ultra 512GB', 'AI-powered flagship with S Pen, 200MP camera, and Galaxy AI features for enhanced productivity.', 1419.99, NULL),
('MacBook Pro 16" M3 Max', 'Powerhouse laptop with M3 Max chip, stunning display, and professional-grade performance for any workflow.', 3499.99, NULL),
('Dell XPS 17 OLED', 'Creator laptop with 4K OLED display, Intel i9 processor, and NVIDIA RTX graphics.', 2899.99, NULL),
('iPad Pro 12.9" M2 2TB', 'The most advanced iPad with M2 chip, Liquid Retina XDR display, and Apple Pencil support.', 2199.99, NULL),

-- Gaming Hardware
('PlayStation 5 Pro Console', 'Next-gen gaming with 8K support, ray tracing, and exclusive games library.', 699.99, NULL),
('Xbox Series X 2TB', 'Most powerful Xbox with expanded storage, 4K gaming, and Game Pass integration.', 649.99, NULL),
('Nintendo Switch OLED White', 'Portable gaming perfection with vibrant OLED screen and versatile play modes.', 349.99, NULL),
('Steam Deck 1TB', 'Handheld PC gaming device that runs your entire Steam library on the go.', 649.99, NULL),
('ROG Ally Gaming Handheld', 'Windows 11 handheld with AMD Ryzen Z1 Extreme for PC gaming anywhere.', 699.99, NULL),

-- Gaming Peripherals
('Razer DeathAdder V3 Pro', 'Wireless gaming mouse with Focus Pro 30K sensor and 90-hour battery life.', 149.99, NULL),
('Logitech G Pro X Superlight', 'Ultra-lightweight wireless gaming mouse used by esports professionals worldwide.', 149.99, NULL),
('Corsair K95 RGB Platinum', 'Mechanical gaming keyboard with Cherry MX switches and programmable RGB lighting.', 199.99, NULL),
('SteelSeries Arctis Nova Pro', 'Premium gaming headset with active noise cancellation and hi-res audio.', 349.99, NULL),
('HyperX Cloud Alpha Wireless', 'Wireless gaming headset with 300-hour battery life and custom-tuned drivers.', 199.99, NULL),

-- Smart Home & IoT
('Amazon Echo Show 15', 'Smart display hub for your home with Alexa, video calls, and entertainment.', 249.99, NULL),
('Google Nest Hub Max', 'Smart home controller with camera, speakers, and Google Assistant integration.', 229.99, NULL),
('Apple HomePod 2nd Gen', 'Premium smart speaker with spatial audio and seamless Apple ecosystem integration.', 299.99, NULL),
('Ring Video Doorbell Pro 2', 'Advanced doorbell with 1536p video, 3D motion detection, and Alexa integration.', 249.99, NULL),
('Nest Learning Thermostat', 'AI-powered thermostat that learns your schedule and saves energy automatically.', 249.99, NULL),

-- Wearables & Health Tech
('Apple Watch Ultra 2', 'Rugged smartwatch for extreme sports with precision GPS and ocean-depth rating.', 799.99, NULL),
('Samsung Galaxy Watch 6 Classic', 'Premium smartwatch with rotating bezel, health monitoring, and long battery life.', 429.99, NULL),
('Fitbit Sense 2', 'Advanced health smartwatch with stress management and heart rhythm notifications.', 299.99, NULL),
('Garmin Fenix 7X Sapphire Solar', 'Multi-sport GPS watch with solar charging and adventure-ready features.', 899.99, NULL),
('Oura Ring Gen 3', 'Smart ring that tracks sleep, activity, and readiness with clinical-grade sensors.', 299.99, NULL),

-- Audio & Music
('Sony WH-1000XM5', 'Industry-leading noise canceling headphones with 30-hour battery and premium sound.', 399.99, NULL),
('AirPods Pro 2nd Gen', 'Active noise cancellation earbuds with spatial audio and adaptive transparency.', 249.99, NULL),
('Bose QuietComfort Earbuds', 'True wireless earbuds with world-class noise cancellation technology.', 279.99, NULL),
('Marshall Acton III', 'Iconic Bluetooth speaker with classic rock aesthetics and powerful sound.', 279.99, NULL),
('JBL Xtreme 3', 'Portable party speaker with massive sound and waterproof design.', 179.99, NULL),

-- Photography & Content Creation
('Canon EOS R5', 'Professional mirrorless camera with 8K video and 45MP full-frame sensor.', 3899.99, NULL),
('Sony Alpha 7R V', 'High-resolution camera with 61MP sensor and advanced AI autofocus.', 3899.99, NULL),
('DJI Mini 4 Pro', 'Compact drone with 4K HDR video, omnidirectional obstacle sensing.', 759.99, NULL),
('GoPro Hero 12 Black', 'Action camera with 5.3K video, HyperSmooth stabilization, and rugged design.', 399.99, NULL),
('Elgato Stream Deck XL', 'Content creation controller with 32 customizable LCD keys for streamers.', 249.99, NULL),

-- Fashion & Accessories
('Luxury Leather Jacket', 'Premium genuine leather jacket with timeless design and superior craftsmanship.', 399.99, NULL),
('Designer Sunglasses', 'High-end sunglasses with polarized lenses and iconic frame design.', 299.99, NULL),
('Swiss Automatic Watch', 'Precision timepiece with automatic movement and sapphire crystal glass.', 899.99, NULL),
('Cashmere Scarf', 'Luxurious cashmere scarf with soft texture and elegant pattern.', 149.99, NULL),
('Italian Leather Handbag', 'Handcrafted leather handbag with exquisite details and spacious interior.', 599.99, NULL),

-- Fitness & Wellness
('Peloton Bike+', 'Interactive exercise bike with live classes and immersive training experience.', 2495.00, NULL),
('Mirror Home Gym', 'Interactive fitness mirror with personal trainers and variety of workouts.', 1495.00, NULL),
('Theragun Elite', 'Professional percussive therapy device for muscle recovery and pain relief.', 399.99, NULL),
('WHOOP 4.0', 'Continuous health monitoring with strain, recovery, and sleep tracking.', 239.99, NULL),
('Hyperice Normatec 3', 'Dynamic compression therapy for faster recovery and improved circulation.', 899.99, NULL),

-- Home & Kitchen
('Dyson V15 Detect Absolute', 'Cordless vacuum with laser detection and intelligent suction adjustment.', 749.99, NULL),
('iRobot Roomba j9+', 'Smart robot vacuum with self-emptying base and advanced navigation.', 899.99, NULL),
('Ninja Foodi Indoor Grill', 'Indoor grill and air fryer combo for healthy and delicious cooking.', 199.99, NULL),
('Breville Barista Express', 'Espresso machine with built-in grinder for cafe-quality coffee at home.', 699.99, NULL),
('KitchenAid Stand Mixer', 'Iconic stand mixer with powerful motor and versatile attachments.', 449.99, NULL),

-- Books & Education
('Complete Web Development Course 2024', 'Comprehensive guide covering HTML, CSS, JavaScript, React, Node.js, and databases.', 89.99, NULL),
('AI & Machine Learning Masterclass', 'Learn artificial intelligence and machine learning with Python and TensorFlow.', 129.99, NULL),
('Digital Marketing Strategy Guide', 'Modern marketing strategies for social media, SEO, and online business growth.', 59.99, NULL),
('Cryptocurrency & Blockchain Guide', 'Understanding digital currencies, DeFi, NFTs, and blockchain technology.', 49.99, NULL),
('Startup Entrepreneur Handbook', 'Complete guide to starting, funding, and scaling a successful startup.', 39.99, NULL),

-- Beauty & Personal Care
('Professional Skincare Set', 'Complete skincare routine with vitamin C serum, retinol, and hyaluronic acid.', 199.99, NULL),
('Hair Styling Tool Kit', 'Professional hair dryer, straightener, and curling iron set with heat protection.', 299.99, NULL),
('Organic Beauty Bundle', 'Natural and organic beauty products for face, body, and hair care.', 149.99, NULL),
('Men''s Grooming Essentials', 'Complete grooming kit with electric razor, trimmer, and premium skincare.', 179.99, NULL),
('Luxury Perfume Collection', 'Curated selection of premium fragrances for different occasions and seasons.', 299.99, NULL);