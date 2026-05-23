import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { AlertsService } from './alerts.service';
import { Alert } from './entities/alert.entity';
import { AlertType } from './dto/create-alert.dto';

const mockRepo = () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  delete: jest.fn(),
});

describe('AlertsService', () => {
  let service: AlertsService;
  let repo: ReturnType<typeof mockRepo>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AlertsService,
        { provide: getRepositoryToken(Alert), useFactory: mockRepo },
      ],
    }).compile();
    service = module.get<AlertsService>(AlertsService);
    repo = module.get(getRepositoryToken(Alert));
  });

  describe('findAll', () => {
    it('queries only the requesting user\'s alerts', async () => {
      repo.find.mockResolvedValue([]);
      await service.findAll('user-a');
      expect(repo.find).toHaveBeenCalledWith({
        where: { userId: 'user-a' },
        order: { createdAt: 'DESC' },
      });
    });
  });

  describe('create', () => {
    it('sets userId on the new alert', async () => {
      const dto = { partNumber: '6205-2RS', alertType: AlertType.PRICE_BELOW, thresholdValue: 10 };
      repo.create.mockReturnValue({ ...dto, userId: 'user-a' });
      repo.save.mockResolvedValue({ id: 'alert-1', ...dto, userId: 'user-a' });
      await service.create(dto, 'user-a');
      expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user-a' }));
    });
  });

  describe('toggle', () => {
    it('throws NotFoundException when alert belongs to a different user', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.toggle('alert-1', 'user-b')).rejects.toThrow(NotFoundException);
      expect(repo.findOne).toHaveBeenCalledWith({ where: { id: 'alert-1', userId: 'user-b' } });
    });

    it('flips isActive when the user owns the alert', async () => {
      const alert = { id: 'alert-1', isActive: true, userId: 'user-a' };
      repo.findOne.mockResolvedValue(alert);
      repo.save.mockResolvedValue({ ...alert, isActive: false });
      const result = await service.toggle('alert-1', 'user-a');
      expect(result.isActive).toBe(false);
    });
  });

  describe('delete', () => {
    it('throws NotFoundException when alert belongs to a different user', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.delete('alert-1', 'user-b')).rejects.toThrow(NotFoundException);
    });

    it('deletes the alert when the user owns it', async () => {
      repo.findOne.mockResolvedValue({ id: 'alert-1', userId: 'user-a' });
      repo.delete.mockResolvedValue({});
      const result = await service.delete('alert-1', 'user-a');
      expect(repo.delete).toHaveBeenCalledWith('alert-1');
      expect(result).toEqual({ deleted: true });
    });
  });
});

describe('AlertsService.findAllActive', () => {
  let service: AlertsService;
  let mockFind: jest.Mock;

  beforeEach(async () => {
    mockFind = jest.fn();
    const module = await Test.createTestingModule({
      providers: [
        AlertsService,
        {
          provide: getRepositoryToken(Alert),
          useValue: { find: mockFind, findOne: jest.fn(), save: jest.fn(), delete: jest.fn(), create: jest.fn() },
        },
      ],
    }).compile();
    service = module.get(AlertsService);
  });

  it('queries only active alerts', async () => {
    const active = [{ id: '1', isActive: true }];
    mockFind.mockResolvedValue(active);
    const result = await service.findAllActive();
    expect(mockFind).toHaveBeenCalledWith({ where: { isActive: true } });
    expect(result).toEqual(active);
  });
});

describe('AlertsService.disableAndStampAlert', () => {
  let service: AlertsService;
  let mockSave: jest.Mock;
  let mockFindOne: jest.Mock;

  beforeEach(async () => {
    mockSave = jest.fn().mockResolvedValue(undefined);
    mockFindOne = jest.fn();
    const module = await Test.createTestingModule({
      providers: [
        AlertsService,
        {
          provide: getRepositoryToken(Alert),
          useValue: { find: jest.fn(), findOne: mockFindOne, save: mockSave, delete: jest.fn(), create: jest.fn() },
        },
      ],
    }).compile();
    service = module.get(AlertsService);
  });

  it('sets isActive=false and stamps lastTriggered', async () => {
    const alert = { id: 'alert-1', isActive: true, lastTriggered: null } as Alert;
    mockFindOne.mockResolvedValue(alert);
    await service.disableAndStampAlert('alert-1');
    expect(mockSave).toHaveBeenCalledWith(
      expect.objectContaining({ isActive: false, lastTriggered: expect.any(Date) }),
    );
  });

  it('throws NotFoundException if alert does not exist', async () => {
    mockFindOne.mockResolvedValue(null);
    await expect(service.disableAndStampAlert('missing')).rejects.toThrow(NotFoundException);
  });
});
