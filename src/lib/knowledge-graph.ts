import type { Application, MockInterview } from '@/stores/journal-store';
import type { KnowledgeGraphData, KnowledgePageSummary } from '@/lib/tauri-api';
import type { Resume } from '@/types/resume';
import type { GraphLinkDatum, GraphNodeDatum } from '@/components/graph/knowledge-graph';

export function normalizeCompany(value: string): string {
  return value
    .replace(/\s+/g, '')
    .replace(/(有限责任公司|有限公司|股份有限公司|股份|集团|科技)$/u, '')
    .toLowerCase();
}

export function mergeKnowledgeGraph(
  graph: KnowledgeGraphData,
  applications: Application[],
  mocks: MockInterview[],
  resumes: Resume[],
): { nodes: GraphNodeDatum[]; edges: GraphLinkDatum[] } {
  const nodes: GraphNodeDatum[] = graph.nodes.map((node) => ({
    id: node.id,
    title: node.title || node.id,
    type: node.type,
  }));
  const edges: GraphLinkDatum[] = graph.edges.map((edge) => ({ ...edge }));
  const companyPages = nodes.filter((node) => node.type === 'company');
  const rolePages = nodes.filter((node) => node.type === 'role');
  const addNode = (node: GraphNodeDatum) => {
    if (!nodes.some((item) => item.id === node.id)) nodes.push(node);
  };
  const addEdge = (source: string, target: string, type: string) => {
    if (!edges.some((edge) => edge.source === source && edge.target === target && edge.type === type)) {
      edges.push({ source, target, type });
    }
  };
  resumes.forEach((resume) => addNode({ id: `resume:${resume.id}`, title: resume.title, type: 'resume' }));
  applications.forEach((application) => {
    const applicationId = `application:${application.id}`;
    addNode({
      id: applicationId,
      title: [application.company, application.role].filter(Boolean).join(' · ') || '未命名投递',
      type: 'application',
    });
    if (application.resumeId) addEdge(applicationId, `resume:${application.resumeId}`, 'application→resume');
    const company = companyPages.find((page) => normalizeCompany(page.title) === normalizeCompany(application.company));
    if (company) addEdge(applicationId, company.id, 'application→company');
    const role = rolePages.find((page) => normalizeCompany(page.title) === normalizeCompany(application.role));
    if (role) addEdge(applicationId, role.id, 'application→role');
    application.interviews.forEach((interview) => {
      const interviewId = `interview:${application.id}:${interview.id}`;
      addNode({ id: interviewId, title: interview.round || '面试', type: 'interview' });
      addEdge(interviewId, applicationId, 'interview→application');
    });
  });
  mocks.forEach((mock) => {
    const mockId = `mock:${mock.id}`;
    addNode({ id: mockId, title: `${mock.company} ${mock.role}`.trim() || '模拟面试', type: 'interview' });
    if (mock.applicationId) addEdge(mockId, `application:${mock.applicationId}`, 'interview→application');
  });
  return { nodes, edges };
}
