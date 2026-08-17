import { IAuthService } from "@/core/auth";
import {
  JWT_TOKEN_ACCESS_EXP,
  JWT_TOKEN_ACCESS_TOPIC,
  JWT_TOKEN_AUDIENCE,
  JWT_TOKEN_ISSUER,
  JWT_TOKEN_REFRESH_EXP,
  JWT_TOKEN_REFRESH_TOPIC,
} from "@/core/config";
import { JwtPayload, jwtServiceId, JwtToken } from "@/core/jwt";
import { AppUser } from "@/core/user";
import { JwtService } from "@/infra/jwt/default/service";
import { randomBytes, randomUUID } from "crypto";
import { inject, injectable } from "inversify";

@injectable()
export class AuthService implements IAuthService {
  public constructor(
    @inject(jwtServiceId)
    private readonly jwtService: JwtService,
  ) {}

  public createAccessToken(user: AppUser): JwtToken {
    const now: number = Math.floor(Date.now() / 1000);
    const exp: number = now + JWT_TOKEN_ACCESS_EXP;

    const payload: JwtPayload = {
      jti: randomUUID(),
      sub: user.id.toString(),
      iss: JWT_TOKEN_ISSUER,
      aud: JWT_TOKEN_AUDIENCE,
      exp,
      nbf: now,
      iat: now,
      "vick:topic": JWT_TOKEN_ACCESS_TOPIC,
    };

    return {
      token: this.jwtService.sign(payload, this.getTokenSecret()),
      payload,
    };
  }

  public createRefreshToken(user: AppUser): JwtToken {
    const now: number = Math.floor(Date.now() / 1000);
    const exp: number = now + JWT_TOKEN_REFRESH_EXP;

    const payload: JwtPayload = {
      jti: randomUUID(),
      sub: randomBytes(32).toString("base64"),
      iss: JWT_TOKEN_ISSUER,
      aud: JWT_TOKEN_AUDIENCE,
      exp,
      nbf: now,
      iat: now,
      "vick:topic": JWT_TOKEN_REFRESH_TOPIC,
      "vick:userId": user.id,
    };

    return {
      token: this.jwtService.sign(payload, this.getTokenSecret()),
      payload,
    };
  }

  public async saveRefreshToken(token: JwtToken): Promise<void> {}

  public async revokeRefreshToken(jti: string): Promise<void> {}

  public async getRefreshToken(jti: string): Promise<string> {
    return null;
  }

  public verifyToken(token: string): JwtPayload {
    return this.jwtService.verify(token, this.getTokenSecret());
  }

  private getTokenSecret(): string {
    return process.env.JWT_TOKEN_SECRET;
  }
}
