import { authServiceId, IAuthService } from "@/core/auth";
import { JWT_TOKEN_ACCESS_EXP, JWT_TOKEN_REFRESH_EXP } from "@/core/config";
import { hashServiceId, IHashService } from "@/core/hash";
import { JwtPayload, JwtToken } from "@/core/jwt";
import {
  IUserService,
  AppUser,
  AppUserCreate,
  AppUserCreateSchema,
  userServiceId,
} from "@/core/user";
import container from "@/di/bindings";
import { authHook } from "@/shared/middlewares/auth";
import { fail, ok } from "@/shared/utils/response";
import { FastifyInstance } from "fastify";
import z from "zod";

const LoginPostSchema = z.object({
  email: z.email(),
  password: z.string().min(8).max(32),
});

type LoginPost = z.infer<typeof LoginPostSchema>;

type LoginPostRequest = {
  Body: LoginPost;
};

type SignupPostRequest = {
  Body: AppUserCreate;
};

export default async function authRoutes(app: FastifyInstance): Promise<void> {
  const authService: IAuthService = container.get(authServiceId);
  const userService: IUserService = container.get(userServiceId);
  const hashService: IHashService = container.get(hashServiceId);

  // Create
  app.post<SignupPostRequest>(
    "/auth/signup",
    async (req, res): Promise<void> => {
      // const parsed: any = AppUserCreateSchema.safeParse(req.body)
      // if (!parsed.success) {
      //   return fail(res, 'Invalid body', 400, parsed.error.message)
      // }
      // const data: AppUserCreate = parsed.data
      // const user: AppUser = await userService.create(data)
      // return ok(res, user)
    },
  );

  // Login
  app.post<LoginPostRequest>("/auth/login", async (req, res) => {
    // const parsed: any = LoginPostSchema.safeParse(req.body)
    // if (!parsed.success) {
    //   return fail(res, 'Invalid body', 400, parsed.error.message)
    // }
    // const data: LoginPost = parsed.data
    // const user: AppUser = await userService.getByEmailWithPassword(data.email)
    // if (!user) {
    //   return fail(res, 'Email or password incorrect', 401)
    // }
    // const isValidPassword: boolean = await hashService.compare(
    //   data.password,
    //   user.password,
    // )
    // if (!isValidPassword) {
    //   return fail(res, 'Email or password incorrect', 401)
    // }
    // const accessToken: JwtToken = authService.createAccessToken(user)
    // const refreshToken: JwtToken = authService.createRefreshToken(user)
    // await authService.saveRefreshToken(refreshToken)
    // user.password = undefined
    // res
    //   .setCookie('accessToken', accessToken.token, {
    //     httpOnly: true,
    //     secure: process.env.NODE_ENV === 'production',
    //     sameSite: 'strict',
    //     path: '/api',
    //     maxAge: JWT_TOKEN_ACCESS_EXP,
    //   })
    //   .setCookie('refreshToken', refreshToken.token, {
    //     httpOnly: true,
    //     secure: process.env.NODE_ENV === 'production',
    //     sameSite: 'strict',
    //     path: '/api/auth/refresh',
    //     maxAge: JWT_TOKEN_REFRESH_EXP,
    //   })
    // return ok(res, user)
  });

  // Refresh Token
  // TODO: Need Testing
  app.post("/auth/refresh", async (req, res) => {
    // const refreshToken: string = req.cookies['refreshToken']
    // if (!refreshToken) {
    //   return fail(res, 'Missing refresh token', 400)
    // }
    // const payload: JwtPayload = authService.verifyToken(refreshToken)
    // if (payload['vick:topic'] !== 'refresh_token') {
    //   return fail(res, 'Invalid token type', 400)
    // }
    // const storedToken: string = await authService.getRefreshToken(payload.jti)
    // if (!storedToken) {
    //   return fail(res, 'Invalid or expired token', 400)
    // }
    // const user: AppUser = await userService.getById(payload['vick:userId'])
    // const newAccessToken: JwtToken = authService.createAccessToken(user)
    // const newRefreshToken: JwtToken = authService.createRefreshToken(user)
    // await authService.revokeRefreshToken(payload.jti)
    // await authService.saveRefreshToken(newRefreshToken)
    // res
    //   .setCookie('accessToken', newAccessToken.token, {
    //     httpOnly: true,
    //     secure: process.env.NODE_ENV === 'production',
    //     sameSite: 'strict',
    //     path: '/api',
    //     maxAge: JWT_TOKEN_ACCESS_EXP,
    //   })
    //   .setCookie('refreshToken', newRefreshToken.token, {
    //     httpOnly: true,
    //     secure: process.env.NODE_ENV === 'production',
    //     sameSite: 'strict',
    //     path: '/api/auth/refresh',
    //     maxAge: JWT_TOKEN_REFRESH_EXP,
    //   })
    // return ok(res)
  });

  // Logout
  app.post(
    "/auth/logout",
    { preHandler: authHook },
    async (req, res): Promise<void> => {},
  );
}
