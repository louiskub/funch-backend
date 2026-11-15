import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { Branch } from '../catalog/entities/branch.entity';
import { CarOption } from './entities/car-option.entity';
import { CreateOptionDto, UpdateOptionDto } from './dto/options.dto';

const response = (option: CarOption) => ({
  id: option.id,
  branchId: option.branchId,
  code: option.code,
  name: option.name,
  description: option.description,
  category: option.category,
  pricingType: option.pricingType,
  price: String(option.price),
  quantityStock: option.quantityStock,
  isActive: option.isActive,
});

@Injectable()
export class OptionsService {
  constructor(
    @InjectRepository(CarOption)
    private readonly carOptionRepo: Repository<CarOption>,
    @InjectRepository(Branch)
    private readonly branchRepo: Repository<Branch>,
  ) {}

  async branches() {
    return this.branchRepo
      .createQueryBuilder('b')
      .select([
        'b.id AS id',
        'b.name AS name',
        'b.city AS city',
        'c.code AS "countryCode"',
      ])
      .innerJoin('country', 'c', 'c.id = b.country_id')
      .orderBy('c.name')
      .addOrderBy('b.name')
      .getRawMany();
  }

  async publicForBranch(branchId: string) {
    const [branch, options] = await Promise.all([
      this.branchRepo.findOneBy({
        id: branchId,
        isActive: true,
      }),
      this.carOptionRepo.find({
        where: { branchId, isActive: true },
        order: { category: 'ASC', name: 'ASC' },
      }),
    ]);
    return branch ? options.map(response) : [];
  }

  async adminForBranch(branchId: string) {
    const options = await this.carOptionRepo.find({
      where: { branchId },
      order: { isActive: 'DESC', name: 'ASC' },
    });
    return options.map(response);
  }

  async create(input: CreateOptionDto) {
    try {
      const branch = await this.branchRepo.findOneBy({ id: input.branchId });
      if (!branch) throw new NotFoundException('Branch not found');
      const option = await this.carOptionRepo.save(
        this.carOptionRepo.create({
          id: randomUUID(),
          branchId: input.branchId,
          code: input.code,
          name: input.name,
          description: input.description ?? '',
          category: input.category,
          pricingType: input.pricingType,
          price: input.price,
          quantityStock: input.quantityStock ?? null,
        }),
      );
      return response(option);
    } catch (error) {
      this.mapConstraintError(error);
    }
  }

  async update(optionId: string, input: UpdateOptionDto) {
    if (input.pricingType !== undefined)
      throw new BadRequestException(
        'Create a new option to change pricing type',
      );
    try {
      const option = await this.carOptionRepo.findOneBy({ id: optionId });
      if (!option) throw new NotFoundException('Option not found');
      Object.assign(option, {
        code: input.code ?? option.code,
        name: input.name ?? option.name,
        description: input.description ?? option.description,
        category: input.category ?? option.category,
        price: input.price ?? option.price,
        isActive: input.isActive ?? option.isActive,
        quantityStock:
          input.quantityStock !== undefined
            ? input.quantityStock
            : option.quantityStock,
      });
      return response(await this.carOptionRepo.save(option));
    } catch (error) {
      this.mapConstraintError(error);
    }
  }

  async delete(optionId: string) {
    const option = await this.carOptionRepo.findOneBy({ id: optionId });
    if (!option) throw new NotFoundException('Option not found');

    const activeBooking = await this.carOptionRepo.manager
      .createQueryBuilder()
      .select(['b.booking_number AS "bookingNumber"'])
      .from('booking_option', 'bo')
      .innerJoin('booking', 'b', 'b.id = bo.booking_id')
      .where(
        "bo.car_option_id = :optionId AND b.status IN ('IN_USE', 'CONFIRMED')",
        { optionId },
      )
      .getRawOne<{ bookingNumber: string }>();

    if (activeBooking) {
      throw new BadRequestException(
        `Cannot delete option "${option.name}" because it is reserved in active booking #${activeBooking.bookingNumber}. Deactivate it instead.`,
      );
    }

    await this.carOptionRepo.delete(optionId);
    return { id: optionId, deleted: true };
  }

  private mapConstraintError(error: unknown): never {
    if (typeof error === 'object' && error !== null) {
      const driverError = Reflect.get(error, 'driverError');
      const code = Reflect.get(driverError ?? error, 'code');
      if (code === '23505')
        throw new ConflictException(
          'Option code already exists for this branch',
        );
      if (code === '23503')
        throw new BadRequestException('Branch does not exist');
      if (code === '23514' || code === '22003')
        throw new BadRequestException(
          'Option value is outside the allowed range',
        );
    }
    throw error;
  }
}
