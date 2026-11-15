import type { DataSource } from 'typeorm';

export async function seedMain(dataSource: DataSource): Promise<void> {
  await dataSource.transaction(async (manager) => {
    await manager.query(`INSERT INTO country (id, code, name, currency_code, driving_side) VALUES
  ('10000000-0000-4000-8000-000000000001', 'TH', 'Thailand', 'THB', 'LEFT'),
  ('10000000-0000-4000-8000-000000000002', 'US', 'United States', 'USD', 'RIGHT')
ON CONFLICT (id) DO NOTHING`);

    await manager.query(`INSERT INTO branch (id, country_id, type, code, airport_code, name, city, state, address, timezone, latitude, longitude) VALUES
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'AIRPORT', 'BKK', 'BKK', 'Suvarnabhumi Airport', 'Bangkok', 'Bangkok', '999 Moo 1, Nong Prue, Bang Phli', 'Asia/Bangkok', 13.690000, 100.750100),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'AIRPORT', 'JFK', 'JFK', 'John F. Kennedy International Airport', 'New York', 'New York', 'Queens, NY 11430', 'America/New_York', 40.641300, -73.778100)
ON CONFLICT (id) DO NOTHING`);

    await manager.query(`INSERT INTO car_type (id, brand, model, seats, transmission, fuel_type, features, image_file_ids) VALUES
  ('30000000-0000-4000-8000-000000000001', 'Toyota', 'Camry', 5, 'AUTO', 'HYBRID', ARRAY['Air conditioning', 'Apple CarPlay', 'Cruise control'], '{}'),
  ('30000000-0000-4000-8000-000000000002', 'Tesla', 'Model 3', 5, 'AUTO', 'ELECTRIC', ARRAY['Air conditioning', 'Navigation', 'Supercharging'], '{}')
ON CONFLICT (id) DO NOTHING`);

    await manager.query(`INSERT INTO car_type_branch (id, car_type_id, branch_id, base_daily_rate, base_hourly_rate, currency_code) VALUES
  ('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 1890.00, 180.00, 'THB'),
  ('40000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 79.00, 12.00, 'USD')
ON CONFLICT (id) DO NOTHING`);

    await manager.query(`INSERT INTO car (id, car_type_branch_id, vin, license_plate, year, status) VALUES
  ('50000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'DEMO-TH-CAMRY-001', 'กข 1234', 2025, 'ACTIVE'),
  ('50000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000002', 'DEMO-US-TESLA-001', 'DEMO3', 2025, 'ACTIVE')
ON CONFLICT (id) DO NOTHING`);
  });
}
