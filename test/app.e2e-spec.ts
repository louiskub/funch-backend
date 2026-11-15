import { Test, TestingModule } from '@nestjs/testing';
import {
  Body,
  Controller,
  Get,
  INestApplication,
  Logger,
  Post,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
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

  @Throttle({ default: { limit: 2, ttl: 60000 } })
  @Get('throttled')
  throttled() {
    return { limited: true };
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

  it('attaches and echoes X-Request-Id correlation headers', async () => {
    const res1 = await request(app.getHttpServer())
      .get('/api/health')
      .expect(200);
    expect(res1.headers['x-request-id']).toBeDefined();
    expect(typeof res1.headers['x-request-id']).toBe('string');
    expect(res1.headers['x-request-id'].length).toBeGreaterThan(0);

    const customId = 'client-trace-12345';
    const res2 = await request(app.getHttpServer())
      .get('/api/health')
      .set('x-request-id', customId)
      .expect(200);
    expect(res2.headers['x-request-id']).toBe(customId);
  });

  it('enforces rate limiting and returns 429 when threshold is exceeded', async () => {
    await request(app.getHttpServer())
      .get('/api/_bootstrap-test/throttled')
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/_bootstrap-test/throttled')
      .expect(200);
    const blocked = await request(app.getHttpServer())
      .get('/api/_bootstrap-test/throttled')
      .expect(429);
    expect(blocked.body).toEqual({
      status: {
        code: 429,
        messages: expect.stringContaining('Too Many Requests'),
      },
      data: null,
    });
    expect(blocked.headers['x-request-id']).toBeDefined();
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await app.close();
  });
});
