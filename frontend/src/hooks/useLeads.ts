import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { leadsService } from '../services/api';
import type { LeadFilters } from '../types';
import toast from 'react-hot-toast';

export function useLeads(filters: LeadFilters) {
  return useQuery({
    queryKey: ['leads', filters],
    queryFn: () => leadsService.list(filters).then((r) => r.data),
  });
}

export function useLead(id: number) {
  return useQuery({
    queryKey: ['lead', id],
    queryFn: () => leadsService.getById(id).then((r) => r.data),
  });
}

export function useUpdateLead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: { status?: string; nome?: string; valor?: number; moeda?: string } }) =>
      leadsService.update(id, data).then((r) => r.data),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['lead', updated.id] });
      toast.success('Lead atualizado!');
    },
    onError: () => {
      toast.error('Erro ao atualizar lead');
    },
  });
}

export function useLeadMessages(leadId: number) {
  return useInfiniteQuery({
    queryKey: ['lead-messages', leadId],
    queryFn: ({ pageParam = 1 }) =>
      leadsService.getMessages(leadId, pageParam as number).then((r) => r.data),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.flatMap((p) => p.messages).length;
      return loaded < lastPage.total ? allPages.length + 1 : undefined;
    },
  });
}
