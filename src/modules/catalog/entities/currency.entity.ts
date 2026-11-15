import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'currency' })
export class Currency {
  @PrimaryColumn({ type: 'char', length: 3 })
  code!: string;

  @Column({ type: 'text' })
  name!: string;

  @Column({ name: 'minor_units', type: 'smallint' })
  minorUnits!: number;
}
