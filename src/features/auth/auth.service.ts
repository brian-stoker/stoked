// src/features/auth/auth.service.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compareSync } from 'bcrypt';
import { UserDTO } from '../user/dto/user.dto';
import { UserService } from '../user/user.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
  ) {}

  async validateUser(username: string, pass: string): Promise<UserDTO | null> {
    const user = await this.userService.findOne(username);
    if (user && compareSync(pass, user.password)) {
      const { password, ...result } = user;
      return result;
    }
    return null;
  }

  async login(user: UserDTO) {
    const payload = { username: user.username, sub: user.id };
    try {
      return {
        access_token: this.jwtService.sign(payload),
      };
    } catch (error) {
      throw new UnauthorizedException('Invalid credentials');
    }
  }
}

// src/features/auth/dto/user.dto.ts
import { IsEmail, IsNotEmpty, MinLength } from 'class-validator';

export class UserDTO {
  @IsEmail()
  email: string;

  @IsNotEmpty()
  @MinLength(8)
  password: string;
}

// src/features/auth/auth.module.ts
import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtModule } from '@nestjs/jwt';
import { UserModule } from '../user/user.module';

@Module({
  imports: [JwtModule.register({ secret: 'your_secret_key' }), UserModule],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}

// src/features/auth/auth.controller.ts
import { Controller, Post, Body, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { UserDTO } from './dto/user.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  async login(@Body() userDto: UserDTO) {
    const user = await this.authService.validateUser(userDto.email, userDto.password);
    if (!user) {
      throw new UnauthorizedException();
    }
    return this.authService.login(user);
  }
}
