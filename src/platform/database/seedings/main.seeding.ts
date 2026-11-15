import type { DataSource } from 'typeorm';

export async function seedMain(dataSource: DataSource): Promise<void> {
  await dataSource.transaction(async (manager) => {
    await manager
      .createQueryBuilder()
      .insert()
      .into('country')
      .values([
        {
          id: '10000000-0000-4000-8000-000000000001',
          code: 'TH',
          name: 'Thailand',
          currency_code: 'THB',
          driving_side: 'LEFT',
        },
        {
          id: '10000000-0000-4000-8000-000000000002',
          code: 'US',
          name: 'United States',
          currency_code: 'USD',
          driving_side: 'RIGHT',
        },
      ])
      .onConflict('("id") DO NOTHING')
      .execute();
    await manager
      .createQueryBuilder()
      .insert()
      .into('branch')
      .values([
        {
          id: '20000000-0000-4000-8000-000000000001',
          country_id: '10000000-0000-4000-8000-000000000001',
          type: 'AIRPORT',
          code: 'BKK',
          airport_code: 'BKK',
          name: 'Suvarnabhumi Airport',
          city: 'Bangkok',
          state: 'Bangkok',
          address: '999 Moo 1, Nong Prue, Bang Phli',
          timezone: 'Asia/Bangkok',
          latitude: 13.69,
          longitude: 100.7501,
        },
        {
          id: '20000000-0000-4000-8000-000000000002',
          country_id: '10000000-0000-4000-8000-000000000002',
          type: 'AIRPORT',
          code: 'JFK',
          airport_code: 'JFK',
          name: 'John F. Kennedy International Airport',
          city: 'New York',
          state: 'New York',
          address: 'Queens, NY 11430',
          timezone: 'America/New_York',
          latitude: 40.6413,
          longitude: -73.7781,
        },
      ])
      .onConflict('("id") DO NOTHING')
      .execute();
    await manager
      .createQueryBuilder()
      .insert()
      .into('car_type')
      .values([
        {
          id: '30000000-0000-4000-8000-000000000001',
          brand: 'Toyota',
          model: 'Camry',
          seats: 5,
          transmission: 'AUTO',
          fuel_type: 'HYBRID',
          features: ['Air conditioning', 'Apple CarPlay', 'Cruise control'],
          image_file_ids: [],
        },
        {
          id: '30000000-0000-4000-8000-000000000002',
          brand: 'Tesla',
          model: 'Model 3',
          seats: 5,
          transmission: 'AUTO',
          fuel_type: 'ELECTRIC',
          features: ['Air conditioning', 'Navigation', 'Supercharging'],
          image_file_ids: [],
        },
      ])
      .onConflict('("id") DO NOTHING')
      .execute();
    await manager
      .createQueryBuilder()
      .insert()
      .into('car_type_branch')
      .values([
        {
          id: '40000000-0000-4000-8000-000000000001',
          car_type_id: '30000000-0000-4000-8000-000000000001',
          branch_id: '20000000-0000-4000-8000-000000000001',
          base_daily_rate: '1890.00',
          base_hourly_rate: '180.00',
          currency_code: 'THB',
        },
        {
          id: '40000000-0000-4000-8000-000000000002',
          car_type_id: '30000000-0000-4000-8000-000000000002',
          branch_id: '20000000-0000-4000-8000-000000000002',
          base_daily_rate: '79.00',
          base_hourly_rate: '12.00',
          currency_code: 'USD',
        },
      ])
      .onConflict('("id") DO NOTHING')
      .execute();
    await manager
      .createQueryBuilder()
      .insert()
      .into('car')
      .values([
        {
          id: '50000000-0000-4000-8000-000000000001',
          car_type_branch_id: '40000000-0000-4000-8000-000000000001',
          vin: 'DEMO-TH-CAMRY-001',
          license_plate: 'กข 1234',
          year: 2025,
          status: 'ACTIVE',
        },
        {
          id: '50000000-0000-4000-8000-000000000002',
          car_type_branch_id: '40000000-0000-4000-8000-000000000002',
          vin: 'DEMO-US-TESLA-001',
          license_plate: 'DEMO3',
          year: 2025,
          status: 'ACTIVE',
        },
      ])
      .onConflict('("id") DO NOTHING')
      .execute();
  });
}
