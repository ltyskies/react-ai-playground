/**
 * @file user.controller.spec.ts
 * @description UserController 的单元测试
 */

import { UserController } from './user.controller';

describe('UserController', () => {
  let controller: UserController;
  const userService = {
    login: jest.fn(),
    register: jest.fn(),
    getPromptRules: jest.fn(),
    updatePromptRules: jest.fn(),
    clearPromptRules: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new UserController(userService as any);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should delegate getPromptRules with current user id', () => {
    controller.getPromptRules({ user: { userId: 7 } });

    expect(userService.getPromptRules).toHaveBeenCalledWith(7);
  });

  it('should delegate updatePromptRules with current user id and rules', () => {
    controller.updatePromptRules(
      { user: { userId: 9 } },
      { rules: 'Always answer in Chinese' },
    );

    expect(userService.updatePromptRules).toHaveBeenCalledWith(
      9,
      'Always answer in Chinese',
    );
  });

  it('should delegate clearPromptRules with current user id', () => {
    controller.clearPromptRules({ user: { userId: 11 } });

    expect(userService.clearPromptRules).toHaveBeenCalledWith(11);
  });
});
