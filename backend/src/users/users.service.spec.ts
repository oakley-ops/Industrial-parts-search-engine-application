import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';

describe('UsersService.updatePushToken', () => {
  let service: UsersService;
  let mockUpdate: jest.Mock;

  beforeEach(async () => {
    mockUpdate = jest.fn().mockResolvedValue(undefined);
    const module = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
            create: jest.fn(),
            update: mockUpdate,
          },
        },
      ],
    }).compile();
    service = module.get(UsersService);
  });

  it('calls repo.update with userId and token', async () => {
    await service.updatePushToken('user-1', 'ExponentPushToken[abc]');
    expect(mockUpdate).toHaveBeenCalledWith('user-1', { expoPushToken: 'ExponentPushToken[abc]' });
  });

  it('calls repo.update with null to clear the token', async () => {
    await service.updatePushToken('user-1', null);
    expect(mockUpdate).toHaveBeenCalledWith('user-1', { expoPushToken: null });
  });
});
