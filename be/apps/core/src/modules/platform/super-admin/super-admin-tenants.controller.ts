import { photoAssets } from '@afilmory/db'
import { Body, Controller, Delete, Get, Param, Patch, Query } from '@afilmory/framework'
import { DbAccessor } from 'core/database/database.provider'
import { Roles } from 'core/guards/roles.decorator'
import { BypassResponseTransform } from 'core/interceptors/response-transform.decorator'
import { BillingPlanService } from 'core/modules/platform/billing/billing-plan.service'
import { BillingUsageService } from 'core/modules/platform/billing/billing-usage.service'
import { TenantService } from 'core/modules/platform/tenant/tenant.service'
import { desc, eq } from 'drizzle-orm'

import type { BillingPlanId } from '../billing/billing-plan.types'
import { DataManagementService } from '../data-management/data-management.service'
import {
  ListTenantsQueryDto,
  TenantIdParamDto,
  TenantPhotosQueryDto,
  UpdateTenantBanDto,
  UpdateTenantPlanDto,
} from './super-admin.dto'

@Controller('super-admin/tenants')
@Roles('superadmin')
@BypassResponseTransform()
export class SuperAdminTenantController {
  constructor(
    private readonly tenantService: TenantService,
    private readonly dataManagementService: DataManagementService,
    private readonly billingPlanService: BillingPlanService,
    private readonly billingUsageService: BillingUsageService,
    private readonly db: DbAccessor,
  ) {}

  @Get('/:tenantId/photos')
  async getTenantPhotos(@Param() params: TenantIdParamDto, @Query() query: TenantPhotosQueryDto) {
    const photos = await this.db
      .get()
      .select()
      .from(photoAssets)
      .where(eq(photoAssets.tenantId, params.tenantId))
      .limit(query.limit)
      .orderBy(desc(photoAssets.createdAt))

    return {
      photos: photos.map((p) => ({
        ...p,
        publicUrl: p.manifest.data.thumbnailUrl,
      })),
    }
  }

  @Get('/')
  async listTenants(@Query() query: ListTenantsQueryDto) {
    const [tenantResult, plans] = await Promise.all([
      this.tenantService.listTenants({
        page: query.page,
        limit: query.limit,
        search: query.search,
        status: query.status,
        sortBy: query.sortBy,
        sortDir: query.sortDir,
      }),
      Promise.resolve(this.billingPlanService.getPlanDefinitions()),
    ])

    const { items: tenantAggregates, total } = tenantResult

    const tenantIds = tenantAggregates.map((aggregate) => aggregate.tenant.id)
    const usageTotalsMap = await this.billingUsageService.getUsageTotalsForTenants(tenantIds)

    return {
      tenants: tenantAggregates.map((aggregate) => ({
        ...aggregate.tenant,
        usageTotals: usageTotalsMap[aggregate.tenant.id] ?? [],
      })),
      plans,
      total,
    }
  }

  @Patch('/:tenantId/plan')
  async updateTenantPlan(@Param() params: TenantIdParamDto, @Body() dto: UpdateTenantPlanDto) {
    await this.billingPlanService.updateTenantPlan(params.tenantId, dto.planId as BillingPlanId)
    return { updated: true }
  }

  @Patch('/:tenantId/ban')
  async updateTenantBan(@Param() params: TenantIdParamDto, @Body() dto: UpdateTenantBanDto) {
    await this.tenantService.setBanned(params.tenantId, dto.banned)
    return { updated: true }
  }

  @Delete('/:tenantId')
  async deleteTenant(@Param() params: TenantIdParamDto) {
    return await this.dataManagementService.deleteTenantAccountById(params.tenantId)
  }
}
