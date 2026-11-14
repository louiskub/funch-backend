import { Test, TestingModule } from '@nestjs/testing';
import {
  Body,
  Controller,
  Get,
  INestApplication,
  Logger,
  Post,
} from '@nestjs/common';
import { IsInt } from 'class-validator';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';

class BootstrapProbeDto {
  @IsInt()
  quantity!: number;
}

@Controller('_bootstrap-test')
class BootstrapProbeController {
  @Post('validation')
  validate(@Body() input: BootstrapProbeDto) {
    return {
      transformed: input instanceof BootstrapProbeDto,
      quantity: input.quantity,
    };
  }

  @Get('failure')
  fail(): never {
    throw new Error('Internal diagnostic detail');
  }
}

describe('HTTP bootstrap (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [BootstrapProbeController],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  it('/api/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/api/health')
      .expect(200)
      .expect({
        status: { code: 200, messages: 'OK' },
        data: { status: 'ok' },
      });
  });

  it('transforms DTOs and wraps successful responses once', async () => {
    await request(app.getHttpServer())
      .post('/api/_bootstrap-test/validation')
      .send({ quantity: 2 })
      .expect(201)
      .expect({
        status: { code: 201, messages: 'Created' },
        data: { transformed: true, quantity: 2 },
      });
  });

  it('rejects invalid and undeclared fields through the global pipe', async () => {
    const result = await request(app.getHttpServer())
      .post('/api/_bootstrap-test/validation')
      .send({ quantity: 'invalid', role: 'ADMIN' })
      .expect(400);
    expect(result.body).toEqual({
      status: {
        code: 400,
        messages: expect.stringContaining('property role should not exist'),
      },
      data: null,
    });
    expect(result.body.status.messages).toContain(
      'quantity must be an integer',
    );
  });

  it('keeps session guards active without CommonModule', async () => {
    await request(app.getHttpServer())
      .get('/api/admin/files')
      .expect(401)
      .expect({
        status: { code: 401, messages: 'Unauthorized' },
        data: null,
      });
  });

  it('logs unexpected failures without exposing internal details', async () => {
    const logger = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    await request(app.getHttpServer())
      .get('/api/_bootstrap-test/failure')
      .expect(500)
      .expect({
        status: { code: 500, messages: 'Internal server error' },
        data: null,
      });
    expect(logger).toHaveBeenCalledWith(
      expect.stringContaining('Internal diagnostic detail'),
    );
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await app.close();
  });
});
