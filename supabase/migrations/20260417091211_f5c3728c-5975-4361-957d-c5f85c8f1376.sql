-- =========================================================
-- ENUMS
-- =========================================================
CREATE TYPE public.app_role AS ENUM ('admin', 'distributor');
CREATE TYPE public.distributor_level AS ENUM ('distributor', 'senior_consultant', 'success_builder', 'supervisor', 'world_team');
CREATE TYPE public.order_status AS ENUM ('pending', 'confirmed', 'shipped', 'delivered', 'cancelled');

-- =========================================================
-- updated_at helper
-- =========================================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- =========================================================
-- PROFILES
-- =========================================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  phone TEXT,
  city TEXT,
  level public.distributor_level NOT NULL DEFAULT 'distributor',
  loyalty_points INTEGER NOT NULL DEFAULT 0,
  monthly_sales NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- USER ROLES + has_role
-- =========================================================
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- =========================================================
-- PRODUCTS
-- =========================================================
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name_ar TEXT NOT NULL,
  description_ar TEXT NOT NULL DEFAULT '',
  price_mad NUMERIC(10,2) NOT NULL CHECK (price_mad >= 0),
  image_url TEXT,
  stock INTEGER NOT NULL DEFAULT 0,
  category TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_products_updated_at
BEFORE UPDATE ON public.products
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- ORDERS
-- =========================================================
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  distributor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status public.order_status NOT NULL DEFAULT 'pending',
  total_mad NUMERIC(12,2) NOT NULL DEFAULT 0,
  points_earned INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_orders_distributor ON public.orders(distributor_id);
CREATE INDEX idx_orders_status ON public.orders(status);

CREATE TRIGGER trg_orders_updated_at
BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- ORDER ITEMS
-- =========================================================
CREATE TABLE public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_mad NUMERIC(10,2) NOT NULL CHECK (unit_price_mad >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_order_items_order ON public.order_items(order_id);

-- =========================================================
-- LOYALTY TRANSACTIONS
-- =========================================================
CREATE TABLE public.loyalty_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  distributor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  points INTEGER NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  admin_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.loyalty_transactions ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_loyalty_distributor ON public.loyalty_transactions(distributor_id);

-- =========================================================
-- RLS POLICIES
-- =========================================================

-- profiles
CREATE POLICY "Users view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Admins delete profiles"
  ON public.profiles FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'));

-- user_roles
CREATE POLICY "Users view own roles"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage roles"
  ON public.user_roles FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- products
CREATE POLICY "Authenticated view active products"
  ON public.products FOR SELECT
  TO authenticated
  USING (active = true OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage products"
  ON public.products FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- orders
CREATE POLICY "Distributors view own orders"
  ON public.orders FOR SELECT
  USING (auth.uid() = distributor_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Distributors create own orders"
  ON public.orders FOR INSERT
  WITH CHECK (auth.uid() = distributor_id);

CREATE POLICY "Admins update orders"
  ON public.orders FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins delete orders"
  ON public.orders FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'));

-- order_items
CREATE POLICY "View order items via order"
  ON public.order_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND (o.distributor_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
    )
  );

CREATE POLICY "Insert items for own orders"
  ON public.order_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND o.distributor_id = auth.uid()
    )
  );

CREATE POLICY "Admins manage order items"
  ON public.order_items FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- loyalty_transactions
CREATE POLICY "View own loyalty"
  ON public.loyalty_transactions FOR SELECT
  USING (auth.uid() = distributor_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage loyalty"
  ON public.loyalty_transactions FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- =========================================================
-- AUTO-CREATE PROFILE + ROLE ON SIGNUP
-- =========================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, phone, city)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''),
    NEW.raw_user_meta_data ->> 'phone',
    NEW.raw_user_meta_data ->> 'city'
  );

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'distributor');

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =========================================================
-- SEED PRODUCTS (Arabic, prices in MAD)
-- =========================================================
INSERT INTO public.products (name_ar, description_ar, price_mad, category, stock, image_url) VALUES
('فورمولا 1 شيك بنكهة الفانيليا', 'وجبة غذائية متوازنة غنية بالبروتين والفيتامينات لدعم التغذية اليومية.', 549.00, 'تغذية', 120, 'https://images.unsplash.com/photo-1594631252845-29fc4cc8cde9?w=600'),
('فورمولا 1 شيك بنكهة الشوكولاتة', 'بديل وجبة لذيذ يوفر طاقة متوازنة طوال اليوم.', 549.00, 'تغذية', 95, 'https://images.unsplash.com/photo-1571115764595-644a1f56a55c?w=600'),
('شاي هيرباليفي الأصلي', 'مشروب عشبي منعش يساعد على الانتعاش والنشاط.', 389.00, 'مشروبات', 200, 'https://images.unsplash.com/photo-1597481499750-3e6b22637e12?w=600'),
('بروتين شخصي مخصص', 'مكمل بروتين عالي الجودة لدعم العضلات والشبع.', 329.00, 'تغذية', 150, 'https://images.unsplash.com/photo-1593095948071-474c5cc2989d?w=600'),
('ألوي مركز', 'مشروب الصبار لدعم الهضم والترطيب.', 419.00, 'مشروبات', 80, 'https://images.unsplash.com/photo-1556881286-fc6915169721?w=600'),
('ألياف وعشبة', 'مكمل غني بالألياف لدعم صحة الجهاز الهضمي.', 289.00, 'مكملات', 110, 'https://images.unsplash.com/photo-1505253758473-96b7015fcd40?w=600'),
('أوميغا 3', 'كبسولات زيت السمك لدعم صحة القلب والدماغ.', 359.00, 'مكملات', 90, 'https://images.unsplash.com/photo-1550572017-edd951b55104?w=600'),
('سيل أكتيف', 'مشروب طاقة طبيعي للتركيز واليقظة.', 269.00, 'مشروبات', 140, 'https://images.unsplash.com/photo-1622597467836-f3e6f9f5b1a3?w=600'),
('ثيرموجيتيكس', 'مكمل لدعم عملية الأيض وحرق الدهون.', 449.00, 'مكملات', 70, 'https://images.unsplash.com/photo-1579722821273-0f6c1b5ce8a3?w=600'),
('فيتامينات متعددة للنساء', 'مزيج متكامل من الفيتامينات والمعادن.', 319.00, 'مكملات', 100, 'https://images.unsplash.com/photo-1559757175-5700dde675bc?w=600'),
('فيتامينات متعددة للرجال', 'مزيج متكامل لدعم الطاقة والمناعة.', 319.00, 'مكملات', 100, 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=600'),
('كريم العناية بالبشرة', 'كريم مرطب يومي لبشرة نضرة وصحية.', 229.00, 'العناية الشخصية', 130, 'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=600');