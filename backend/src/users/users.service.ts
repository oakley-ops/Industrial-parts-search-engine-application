import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(@InjectRepository(User) private repo: Repository<User>) {}

  findByEmail(email: string) { return this.repo.findOne({ where: { email } }); }
  findById(id: string) { return this.repo.findOne({ where: { id } }); }

  async create(email: string, password: string, name?: string) {
    const passwordHash = await bcrypt.hash(password, 12);
    return this.repo.save(this.repo.create({ email, passwordHash, name }));
  }

  validatePassword(user: User, password: string) {
    return bcrypt.compare(password, user.passwordHash);
  }
}
