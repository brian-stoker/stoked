import { Injectable } from '@nestjs/common';

interface User {
  id: string;
  email: string;
  password: string;
}

@Injectable()
export class UserService {
  private users: User[] = [];

  async create(user: Omit<User, 'id'>): Promise<User> {
    const newUser = {
      id: Math.random().toString(36).substr(2, 9),
      ...user,
    };
    this.users.push(newUser);
    return newUser;
  }

  async findByEmail(email: string): Promise<User | undefined> {
    return this.users.find(user => user.email === email);
  }
} 