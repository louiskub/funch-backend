CREATE TABLE IF NOT EXISTS country (
  id uuid PRIMARY KEY,
  code char(2) NOT NULL UNIQUE,
  name text NOT NULL,
  currency_code char(3) NOT NULL,
  driving_side text NOT NULL CHECK (driving_side IN ('LEFT', 'RIGHT'))
);

CREATE TABLE IF NOT EXISTS branch (
  id uuid PRIMARY KEY,
  country_id uuid NOT NULL REFERENCES country(id),
  type text NOT NULL CHECK (type IN ('AIRPORT', 'DOWNTOWN', 'TRAIN_STATION')),
  code text NOT NULL UNIQUE,
  airport_code char(3),
  name text NOT NULL,
  city text NOT NULL,
  state text,
  address text NOT NULL,
  timezone text NOT NULL,
  latitude numeric(9,6) NOT NULL,
  longitude numeric(9,6) NOT NULL,
  is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS car_type (
  id uuid PRIMARY KEY,
  brand text NOT NULL,
  model text NOT NULL,
  seats integer NOT NULL CHECK (seats > 0),
  transmission text NOT NULL CHECK (transmission IN ('AUTO', 'MANUAL')),
  fuel_type text NOT NULL CHECK (fuel_type IN ('GASOLINE', 'DIESEL', 'ELECTRIC', 'HYBRID')),
  features text[] NOT NULL DEFAULT '{}',
  image_file_ids uuid[] NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand, model)
);

CREATE TABLE IF NOT EXISTS car_type_branch (
  id uuid PRIMARY KEY,
  car_type_id uuid NOT NULL REFERENCES car_type(id),
  branch_id uuid NOT NULL REFERENCES branch(id),
  base_daily_rate numeric(14,4) NOT NULL CHECK (base_daily_rate >= 0),
  base_hourly_rate numeric(14,4) NOT NULL CHECK (base_hourly_rate >= 0),
  currency_code char(3) NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  UNIQUE (car_type_id, branch_id)
);

CREATE TABLE IF NOT EXISTS car (
  id uuid PRIMARY KEY,
  car_type_branch_id uuid NOT NULL REFERENCES car_type_branch(id),
  vin text NOT NULL UNIQUE,
  license_plate text NOT NULL UNIQUE,
  year integer NOT NULL,
  buy_date date,
  status text NOT NULL CHECK (status IN ('ACTIVE', 'MAINTENANCE', 'DECOMMISSIONED')),
  is_active boolean NOT NULL DEFAULT true
);
