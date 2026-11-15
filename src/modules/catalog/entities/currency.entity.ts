import { Check, Column, Entity, PrimaryColumn } from 'typeorm';
import { BaseTimestampEntity } from '../../../common/entities/base.entity';

@Entity({ name: 'currency' })
@Check('currency_code_check', "code ~ '^[A-Z]{3}$'")
@Check('currency_name_check', 'length(btrim(name)) > 0')
@Check('currency_minor_units_check', 'minor_units BETWEEN 0 AND 4')
export class Currency extends BaseTimestampEntity {
  @PrimaryColumn({ type: 'char', length: 3 })
  code!: string;

  @Column({ type: 'text' })
  name!: string;

  @Column({ name: 'minor_units', type: 'smallint' })
  minorUnits!: number;
}
