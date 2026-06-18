import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly usersRepo: Repository<User>,
  ) {}

  async findAll(): Promise<User[]> {
    return this.usersRepo.find();
  }

  async findById(id: number): Promise<User> {
    const user = await this.usersRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  /** Used only for login — explicitly pulls passwordHash (hidden by default via select:false). */
  async findByUsername(username: string): Promise<User | null> {
    return this.usersRepo.findOne({
      where: { username },
      select: {
        id: true,
        username: true,
        passwordHash: true,
        role: true,
        language: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async create(dto: CreateUserDto): Promise<User> {
    const existing = await this.findByUsername(dto.username);
    if (existing) throw new ConflictException('Username already taken');

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = this.usersRepo.create({
      username: dto.username,
      email: dto.email,
      passwordHash,
      role: dto.role,
      language: dto.language,
      isActive: dto.isActive ?? true,
    });
    return this.usersRepo.save(user);
  }

  async update(id: number, dto: UpdateUserDto): Promise<User> {
    const user = await this.findById(id);
    if (dto.password) {
      user.passwordHash = await bcrypt.hash(dto.password, 10);
    }
    Object.assign(user, {
      username: dto.username ?? user.username,
      email: dto.email ?? user.email,
      role: dto.role ?? user.role,
      language: dto.language ?? user.language,
      isActive: dto.isActive ?? user.isActive,
    });
    return this.usersRepo.save(user);
  }

  async remove(id: number): Promise<void> {
    const user = await this.findById(id);
    await this.usersRepo.remove(user);
  }
}
