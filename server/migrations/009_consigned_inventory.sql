CREATE TABLE inventory_suppliers (
 id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 255),
 contact text NOT NULL DEFAULT '', notes text NOT NULL DEFAULT '', active boolean NOT NULL DEFAULT true,
 created_by integer NOT NULL REFERENCES app_users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE inventory_products (
 id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 supplier_id integer NOT NULL REFERENCES inventory_suppliers(id),
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 255), description text NOT NULL DEFAULT '',
 kind text NOT NULL CHECK(kind IN ('consigned','courtesy')),
 sale_price numeric(7,2) NOT NULL CHECK(sale_price>=0),
 supplier_percent numeric(5,2) NOT NULL CHECK(supplier_percent BETWEEN 0 AND 100),
 acquisition_cost numeric(7,2) NOT NULL CHECK(acquisition_cost>=0),
 stock integer NOT NULL DEFAULT 0 CHECK(stock>=0), active boolean NOT NULL DEFAULT true,
 created_by integer NOT NULL REFERENCES app_users(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK((kind='consigned' AND sale_price>0 AND acquisition_cost=0) OR (kind='courtesy' AND sale_price=0 AND supplier_percent=0))
);
ALTER TABLE order_consumptions
 ADD COLUMN product_id integer REFERENCES inventory_products(id),
 ADD COLUMN product_kind text CHECK(product_kind IN ('consigned','courtesy')),
 ADD COLUMN supplier_id integer REFERENCES inventory_suppliers(id),
 ADD COLUMN supplier_percent numeric(5,2),
 ADD COLUMN acquisition_cost numeric(7,2),
 ADD COLUMN supplier_cents bigint,
 ADD COLUMN recognized_at timestamptz,
 ADD COLUMN stock_returned boolean;
CREATE TABLE inventory_movements (
 id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY, product_id integer NOT NULL REFERENCES inventory_products(id),
 quantity integer NOT NULL CHECK(quantity<>0),
 kind text NOT NULL CHECK(kind IN ('entry','sale','courtesy','supplier_return','loss','adjustment','customer_return')),
 reason text NOT NULL CHECK(length(reason) BETWEEN 3 AND 1000),
 unit_cost numeric(7,2) NOT NULL DEFAULT 0 CHECK(unit_cost>=0),
 order_item_id integer REFERENCES order_consumptions(id), request_key uuid NOT NULL UNIQUE,
 created_by integer NOT NULL REFERENCES app_users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE inventory_supplier_entries (
 id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY, supplier_id integer NOT NULL REFERENCES inventory_suppliers(id),
 kind text NOT NULL CHECK(kind IN ('consignment','purchase','purchase_return','reversal')),
 amount_cents bigint NOT NULL, gross_cents bigint NOT NULL DEFAULT 0,
 description text NOT NULL, order_item_id integer REFERENCES order_consumptions(id),
 movement_id integer REFERENCES inventory_movements(id), created_by integer NOT NULL REFERENCES app_users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(order_item_id,kind), UNIQUE(movement_id)
);
CREATE TABLE inventory_supplier_payments (
 id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY, supplier_id integer NOT NULL REFERENCES inventory_suppliers(id),
 period date NOT NULL CHECK(extract(day FROM period)=1), amount_cents bigint NOT NULL CHECK(amount_cents>0),
 description text NOT NULL, request_key uuid NOT NULL UNIQUE,
 transaction_id integer NOT NULL UNIQUE REFERENCES salon_transactions(id),
 created_by integer NOT NULL REFERENCES app_users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE inventory_product_changes (
 id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY, product_id integer NOT NULL REFERENCES inventory_products(id),
 previous_data jsonb NOT NULL, current_data jsonb NOT NULL, changed_by integer NOT NULL REFERENCES app_users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX inventory_products_supplier ON inventory_products(supplier_id);
CREATE INDEX inventory_movements_product ON inventory_movements(product_id,id DESC);
CREATE INDEX inventory_entries_supplier_date ON inventory_supplier_entries(supplier_id,created_at,id);
CREATE INDEX inventory_payments_supplier_period ON inventory_supplier_payments(supplier_id,period,id);
CREATE INDEX inventory_consumptions_product ON order_consumptions(product_id) WHERE product_id IS NOT NULL;
INSERT INTO transaction_types(name,description,created_at) VALUES('Pagamento a fornecedor','Pagamento registrado no módulo de Produtos',now()) ON CONFLICT(name) DO NOTHING;
INSERT INTO profile_permissions(role,permission_key,allowed,delegatable)
 SELECT role,key,role='ADMIN' OR key='orders.products',role='OPERATIONAL' AND operational
 FROM access_profiles CROSS JOIN (VALUES
 ('products.view',true),('products.manage',false),('products.stock',false),('products.suppliers',false),('products.settlements',false),('orders.products',true)
 ) AS permissions(key,operational);
