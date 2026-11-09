import { IDatabaseUnitOfWork, unitOfWorkServiceId } from '@/core/db'
import {
  IScheduleRepository,
  IScheduleService,
  Schedule,
  ScheduleCreate,
  scheduleRepositoryId,
} from '@/core/schedule'
import { inject, injectable } from 'inversify'

@injectable()
export class ScheduleService implements IScheduleService {
  public constructor(
    @inject(unitOfWorkServiceId) private readonly work: IDatabaseUnitOfWork,
    @inject(scheduleRepositoryId)
    private readonly scheduleRepo: IScheduleRepository,
  ) {}

  public list(start: Date, end: Date): Promise<Schedule[]> {
    return this.scheduleRepo.list(start, end)
  }

  public create(data: ScheduleCreate): Promise<Schedule> {
    return this.work.transaction((client) =>
      this.scheduleRepo.create(data, client),
    )
  }
}
