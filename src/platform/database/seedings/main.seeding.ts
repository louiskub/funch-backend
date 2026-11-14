import type { DataSource } from 'typeorm';

export async function seedMain(dataSource: DataSource): Promise<void> {
  await dataSource.query(`INSERT INTO country (id, code, name, currency_code, driving_side) VALUES
  ('10000000-0000-4000-8000-000000000001', 'TH', 'Thailand', 'THB', 'LEFT'),
  ('10000000-0000-4000-8000-000000000002', 'US', 'United States', 'USD', 'RIGHT')
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name,
  currency_code = EXCLUDED.currency_code, driving_side = EXCLUDED.driving_side`);

  await dataSource.query(`INSERT INTO branch (id, country_id, type, code, airport_code, name, city, state, address, timezone, latitude, longitude) VALUES
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'AIRPORT', 'BKK', 'BKK', 'Suvarnabhumi Airport', 'Bangkok', 'Bangkok', '999 Moo 1, Nong Prue, Bang Phli', 'Asia/Bangkok', 13.690000, 100.750100),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'AIRPORT', 'JFK', 'JFK', 'John F. Kennedy International Airport', 'New York', 'New York', 'Queens, NY 11430', 'America/New_York', 40.641300, -73.778100)
ON CONFLICT (id) DO UPDATE SET country_id = EXCLUDED.country_id, type = EXCLUDED.type,
  code = EXCLUDED.code, airport_code = EXCLUDED.airport_code, name = EXCLUDED.name,
  city = EXCLUDED.city, state = EXCLUDED.state, address = EXCLUDED.address,
  timezone = EXCLUDED.timezone, latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude,
  is_active = true`);

  await dataSource.query(`INSERT INTO car_type (id, brand, model, seats, transmission, fuel_type, features, image_file_ids) VALUES
  ('30000000-0000-4000-8000-000000000001', 'Toyota', 'Camry', 5, 'AUTO', 'HYBRID', ARRAY['Air conditioning', 'Apple CarPlay', 'Cruise control'], '{}'),
  ('30000000-0000-4000-8000-000000000002', 'Tesla', 'Model 3', 5, 'AUTO', 'ELECTRIC', ARRAY['Air conditioning', 'Navigation', 'Supercharging'], '{}')
ON CONFLICT (id) DO UPDATE SET brand = EXCLUDED.brand, model = EXCLUDED.model,
  seats = EXCLUDED.seats, transmission = EXCLUDED.transmission, fuel_type = EXCLUDED.fuel_type,
  features = EXCLUDED.features, image_file_ids = EXCLUDED.image_file_ids, is_active = true`);

  await dataSource.query(`INSERT INTO car_type_branch (id, car_type_id, branch_id, base_daily_rate, base_hourly_rate, currency_code) VALUES
  ('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 1890.00, 180.00, 'THB'),
  ('40000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 79.00, 12.00, 'USD')
ON CONFLICT (id) DO UPDATE SET car_type_id = EXCLUDED.car_type_id, branch_id = EXCLUDED.branch_id,
  base_daily_rate = EXCLUDED.base_daily_rate, base_hourly_rate = EXCLUDED.base_hourly_rate,
  currency_code = EXCLUDED.currency_code, is_active = true`);

  await dataSource.query(`INSERT INTO car (id, car_type_branch_id, vin, license_plate, year, status) VALUES
  ('50000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'DEMO-TH-CAMRY-001', 'กข 1234', 2025, 'ACTIVE'),
  ('50000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000002', 'DEMO-US-TESLA-001', 'DEMO3', 2025, 'ACTIVE')
ON CONFLICT (id) DO UPDATE SET car_type_branch_id = EXCLUDED.car_type_branch_id,
  vin = EXCLUDED.vin, license_plate = EXCLUDED.license_plate, year = EXCLUDED.year,
  status = EXCLUDED.status, is_active = true`);
}
