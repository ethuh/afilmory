import {
  Button,
  Input,
  Modal,
  Prompt,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@afilmory/ui'
import { Spring } from '@afilmory/utils'
import { ArrowDownIcon, ArrowUpIcon, ChevronLeftIcon, ChevronRightIcon, RefreshCcwIcon, SearchIcon } from 'lucide-react'
import { m } from 'motion/react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { LinearBorderPanel } from '~/components/common/LinearBorderPanel'
import { getRequestErrorMessage } from '~/lib/errors'

import {
  useDeleteTenantMutation,
  useSuperAdminTenantsQuery,
  useUpdateTenantBanMutation,
  useUpdateTenantPlanMutation,
} from '../hooks'
import type { BillingPlanDefinition, SuperAdminTenantSummary } from '../types'
import { TenantDetailModal } from './TenantDetailModal'
import { TenantUsageCell } from './TenantUsageCell'

const DATE_FORMATTER = new Intl.DateTimeFormat('zh-CN', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

export function SuperAdminTenantManager() {
  const [page, setPage] = useState(1)
  const [limit] = useState(10)
  const [status, setStatus] = useState<string>('all')
  const [sortBy, setSortBy] = useState<string>('createdAt')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  const tenantsQuery = useSuperAdminTenantsQuery({
    page,
    limit,
    search: debouncedSearch,
    status: status === 'all' ? undefined : status,
    sortBy,
    sortDir,
  })
  const updatePlanMutation = useUpdateTenantPlanMutation()
  const updateBanMutation = useUpdateTenantBanMutation()
  const deleteTenantMutation = useDeleteTenantMutation()
  const { t } = useTranslation()

  const { isLoading } = tenantsQuery
  const { isError } = tenantsQuery
  const { data } = tenantsQuery

  const plans = data?.plans ?? []
  const tenants = data?.tenants ?? []
  const total = data?.total ?? 0
  const totalPages = Math.ceil(total / limit)

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(field)
      setSortDir('asc')
    }
  }

  const handlePlanChange = (tenant: SuperAdminTenantSummary, planId: string) => {
    if (planId === tenant.planId) {
      return
    }
    updatePlanMutation.mutate(
      { tenantId: tenant.id, planId },
      {
        onSuccess: () => {
          toast.success(t('superadmin.tenants.toast.plan-success', { name: tenant.name, planId }))
        },
        onError: (error) => {
          toast.error(t('superadmin.tenants.toast.plan-error'), {
            description: error instanceof Error ? error.message : t('common.retry-later'),
          })
        },
      },
    )
  }

  const handleToggleBanned = (tenant: SuperAdminTenantSummary) => {
    const next = !tenant.banned
    updateBanMutation.mutate(
      { tenantId: tenant.id, banned: next },
      {
        onSuccess: () => {
          toast.success(
            next
              ? t('superadmin.tenants.toast.ban-success', { name: tenant.name })
              : t('superadmin.tenants.toast.unban-success', { name: tenant.name }),
          )
        },
        onError: (error) => {
          toast.error(t('superadmin.tenants.toast.ban-error'), {
            description: error instanceof Error ? error.message : t('common.retry-later'),
          })
        },
      },
    )
  }

  const isPlanUpdating = (tenantId: string) =>
    updatePlanMutation.isPending && updatePlanMutation.variables?.tenantId === tenantId

  const isBanUpdating = (tenantId: string) =>
    updateBanMutation.isPending && updateBanMutation.variables?.tenantId === tenantId

  const isDeleting = (tenantId: string) => deleteTenantMutation.isPending && deleteTenantMutation.variables === tenantId

  const handleDeleteTenant = (tenant: SuperAdminTenantSummary) => {
    const requiredSlug = tenant.slug.trim()

    Prompt.input({
      title: t('superadmin.tenants.prompt.delete.title'),
      description: t('superadmin.tenants.prompt.delete.description', { name: tenant.name }),
      placeholder: t('superadmin.tenants.prompt.delete.placeholder', { slug: requiredSlug }),
      variant: 'danger',
      onConfirmText: t('superadmin.tenants.prompt.delete.confirm'),
      onCancelText: t('superadmin.tenants.prompt.delete.cancel'),
      onConfirm: (input) => {
        const normalized = input.trim()
        if (normalized !== requiredSlug) {
          toast.error(t('superadmin.tenants.prompt.delete.mismatch'), {
            description: t('superadmin.tenants.prompt.delete.placeholder', { slug: requiredSlug }),
          })
          return
        }

        deleteTenantMutation.mutate(tenant.id, {
          onSuccess: () => {
            toast.success(t('superadmin.tenants.toast.delete-success', { name: tenant.name }))
          },
          onError: (error) => {
            const description = getRequestErrorMessage(error, t('common.retry-later'))
            toast.error(t('superadmin.tenants.toast.delete-error'), { description })
          },
        })
      },
    })
  }

  if (isError) {
    return (
      <LinearBorderPanel className="p-6 text-sm text-red">
        {t('superadmin.tenants.error.loading', {
          reason: tenantsQuery.error instanceof Error ? tenantsQuery.error.message : t('common.unknown-error'),
        })}
      </LinearBorderPanel>
    )
  }

  if (isLoading) {
    return <TenantSkeleton />
  }

  const SortIcon = ({ field }: { field: string }) => {
    if (sortBy !== field) return null
    return sortDir === 'asc' ? <ArrowUpIcon className="size-3 ml-1" /> : <ArrowDownIcon className="size-3 ml-1" />
  }

  return (
    <m.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={Spring.presets.smooth}>
      <header className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-[200px]">
            <Select
              value={status}
              onValueChange={(val) => {
                setStatus(val)
                setPage(1)
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder={t('superadmin.tenants.filter.status')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('superadmin.tenants.filter.all')}</SelectItem>
                <SelectItem value="active">{t('superadmin.tenants.status.active')}</SelectItem>
                <SelectItem value="inactive">{t('superadmin.tenants.status.inactive')}</SelectItem>
                <SelectItem value="suspended">{t('superadmin.tenants.status.suspended')}</SelectItem>
                <SelectItem value="pending">{t('superadmin.tenants.status.pending')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="w-[240px] relative">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-text-tertiary pointer-events-none" />
            <Input
              className="pl-9"
              placeholder={t('superadmin.tenants.search.placeholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="gap-1"
          onClick={() => tenantsQuery.refetch()}
          disabled={tenantsQuery.isFetching}
        >
          <RefreshCcwIcon className="size-4" />
          <span>
            {tenantsQuery.isFetching ? t('superadmin.tenants.refresh.loading') : t('superadmin.tenants.refresh.button')}
          </span>
        </Button>
      </header>

      <LinearBorderPanel className="p-6 bg-background-secondary">
        {tenants.length === 0 ? (
          <p className="text-text-secondary text-sm">{t('superadmin.tenants.empty')}</p>
        ) : (
          <div className="overflow-x-auto mt-4">
            <table className="min-w-full divide-y divide-border/40 text-sm">
              <thead>
                <tr className="text-text-tertiary text-xs uppercase tracking-wide">
                  <th
                    className="px-3 py-2 text-left cursor-pointer hover:text-text select-none"
                    onClick={() => handleSort('name')}
                  >
                    <div className="flex items-center">
                      {t('superadmin.tenants.table.tenant')}
                      <SortIcon field="name" />
                    </div>
                  </th>
                  <th className="px-3 py-2 text-left">{t('superadmin.tenants.table.plan')}</th>
                  <th className="px-3 py-2 text-left">{t('superadmin.tenants.table.usage')}</th>
                  <th className="px-3 py-2 text-center">{t('superadmin.tenants.table.status')}</th>
                  <th className="px-3 py-2 text-center">{t('superadmin.tenants.table.ban')}</th>
                  <th
                    className="px-3 py-2 text-left cursor-pointer hover:text-text select-none"
                    onClick={() => handleSort('createdAt')}
                  >
                    <div className="flex items-center">
                      {t('superadmin.tenants.table.created')}
                      <SortIcon field="createdAt" />
                    </div>
                  </th>
                  <th className="px-3 py-2 text-right">{t('superadmin.tenants.table.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20">
                {tenants.map((tenant) => (
                  <tr key={tenant.id}>
                    <td className="px-3 py-3 align-top">
                      <div className="font-medium text-text">{tenant.name}</div>
                      <div className="text-text-secondary text-xs">{tenant.slug}</div>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <PlanSelector
                        value={tenant.planId}
                        plans={plans}
                        disabled={isPlanUpdating(tenant.id)}
                        onChange={(nextPlan) => handlePlanChange(tenant, nextPlan)}
                      />
                    </td>
                    <td className="px-3 py-3 align-top">
                      <div
                        className="cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={() => Modal.present(TenantDetailModal, { tenant })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            Modal.present(TenantDetailModal, { tenant })
                          }
                        }}
                        role="button"
                        tabIndex={0}
                      >
                        <TenantUsageCell usageTotals={tenant.usageTotals} />
                      </div>
                    </td>
                    <td className="px-3 py-3 text-center align-top">
                      <StatusBadge status={tenant.status} banned={tenant.banned} />
                    </td>
                    <td className="px-3 py-1 text-center align-top">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className={tenant.banned ? 'text-rose-400' : undefined}
                        onClick={() => handleToggleBanned(tenant)}
                        disabled={isBanUpdating(tenant.id)}
                      >
                        {isBanUpdating(tenant.id)
                          ? t('superadmin.tenants.button.processing')
                          : tenant.banned
                            ? t('superadmin.tenants.button.unban')
                            : t('superadmin.tenants.button.ban')}
                      </Button>
                    </td>
                    <td className="px-3 py-3 align-top text-text-secondary text-xs">
                      {formatDateLabel(tenant.createdAt)}
                    </td>
                    <td className="px-3 py-2 align-top text-right">
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        disabled={isDeleting(tenant.id)}
                        onClick={() => handleDeleteTenant(tenant)}
                      >
                        {isDeleting(tenant.id)
                          ? t('superadmin.tenants.button.processing')
                          : t('superadmin.tenants.button.delete')}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="flex items-center justify-between mt-6 border-t border-border/40 pt-4">
              <div className="text-xs text-text-tertiary">
                {t('superadmin.tenants.pagination.showing', {
                  start: (page - 1) * limit + 1,
                  end: Math.min(page * limit, total),
                  total,
                })}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  className="size-8"
                  disabled={page <= 1 || tenantsQuery.isFetching}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronLeftIcon className="size-4" />
                </Button>
                <div className="text-sm text-text-secondary font-medium">
                  {page} / {totalPages || 1}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  className="size-8"
                  disabled={page >= totalPages || tenantsQuery.isFetching}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRightIcon className="size-4" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </LinearBorderPanel>
    </m.div>
  )
}

function PlanSelector({
  value,
  plans,
  disabled,
  onChange,
}: {
  value: string
  plans: BillingPlanDefinition[]
  disabled?: boolean
  onChange: (value: string) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="space-y-1">
      <Select value={value} onValueChange={(value) => onChange(value)} disabled={disabled}>
        <SelectTrigger>
          <SelectValue placeholder={t('superadmin.tenants.plan.placeholder')} />
        </SelectTrigger>
        <SelectContent>
          {plans.map((plan) => (
            <SelectItem value={plan.id} key={plan.id}>
              {plan.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <PlanDescription plan={plans.find((plan) => plan.id === value)} />
    </div>
  )
}

function PlanDescription({ plan }: { plan: BillingPlanDefinition | undefined }) {
  if (!plan) {
    return null
  }
  return <p className="text-text-tertiary text-xs">{plan.description}</p>
}

function StatusBadge({ status, banned }: { status: SuperAdminTenantSummary['status']; banned: boolean }) {
  const { t } = useTranslation()
  if (banned) {
    return (
      <span className="bg-rose-500/10 text-rose-400 rounded-full px-2 py-0.5 text-xs">
        {t('superadmin.tenants.status.banned')}
      </span>
    )
  }
  if (status === 'active') {
    return (
      <span className="bg-emerald-500/10 text-emerald-400 rounded-full px-2 py-0.5 text-xs">
        {t('superadmin.tenants.status.active')}
      </span>
    )
  }
  if (status === 'suspended') {
    return (
      <span className="bg-amber-500/10 text-amber-400 rounded-full px-2 py-0.5 text-xs">
        {t('superadmin.tenants.status.suspended')}
      </span>
    )
  }

  return (
    <span className="bg-slate-500/10 text-slate-400 rounded-full px-2 py-0.5 text-xs">
      {t('superadmin.tenants.status.inactive')}
    </span>
  )
}

function formatDateLabel(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return DATE_FORMATTER.format(date)
}

function TenantSkeleton() {
  return (
    <LinearBorderPanel className="space-y-4 p-6">
      <div className="bg-fill/40 h-6 w-1/3 animate-pulse rounded" />
      <div className="space-y-3">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={`tenant-skeleton-${index}`} className="bg-fill/20 h-14 animate-pulse rounded" />
        ))}
      </div>
    </LinearBorderPanel>
  )
}
