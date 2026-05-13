/**
 * @file user.service.spec.ts
 * @description UserService 的单元测试
 */

import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { UserService } from './user.service';

describe('UserService', () => {
  let service: UserService;
  let userRepo: {
    findOne: jest.Mock;
    save: jest.Mock;
  };
  let jwtService: {
    sign: jest.Mock;
  };
  let configService: {
    get: jest.Mock;
  };

  beforeEach(() => {
    userRepo = {
      findOne: jest.fn(),
      save: jest.fn(),
    };
    jwtService = {
      sign: jest.fn(),
    };
    configService = {
      get: jest.fn(),
    };

    service = new UserService(
      userRepo as any,
      jwtService as any,
      configService as any,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return current prompt rules', async () => {
    userRepo.findOne.mockResolvedValue({
      id: 1,
      promptRules: 'Always answer in Chinese',
    });

    await expect(service.getPromptRules(1)).resolves.toEqual({
      code: 200,
      data: {
        rules: 'Always answer in Chinese',
      },
    });
  });

  it('should save prompt rules for current user', async () => {
    const user = {
      id: 1,
      promptRules: null,
    };
    userRepo.findOne.mockResolvedValue(user);
    userRepo.save.mockImplementation(async (entity) => entity);

    const result = await service.updatePromptRules(
      1,
      'Keep explanations short',
    );

    expect(user.promptRules).toBe('Keep explanations short');
    expect(userRepo.save).toHaveBeenCalledWith(user);
    expect(result).toEqual({
      code: 200,
      data: {
        rules: 'Keep explanations short',
      },
    });
  });

  it('should normalize whitespace-only prompt rules to empty state', async () => {
    const user = {
      id: 1,
      promptRules: 'Previous rules',
    };
    userRepo.findOne.mockResolvedValue(user);
    userRepo.save.mockImplementation(async (entity) => entity);

    const result = await service.updatePromptRules(1, '   ');

    expect(user.promptRules).toBeNull();
    expect(result).toEqual({
      code: 200,
      data: {
        rules: '',
      },
    });
  });

  it('should clear prompt rules', async () => {
    const user = {
      id: 1,
      promptRules: 'Always use full file replacements',
    };
    userRepo.findOne.mockResolvedValue(user);
    userRepo.save.mockImplementation(async (entity) => entity);

    const result = await service.clearPromptRules(1);

    expect(user.promptRules).toBeNull();
    expect(result).toEqual({
      code: 200,
      data: {
        rules: '',
      },
    });
  });

  it('should reject non-string prompt rules payloads', async () => {
    await expect(
      service.updatePromptRules(1, undefined as unknown as string),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('should reject missing authenticated user id', async () => {
    await expect(service.getPromptRules(undefined)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('should reject unknown authenticated user', async () => {
    userRepo.findOne.mockResolvedValue(null);

    await expect(service.getPromptRules(1)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
