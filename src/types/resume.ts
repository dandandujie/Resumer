export interface QrCodeItem {
  id: string;
  label: string;
  url: string;
}

export interface PersonalInfoContent {
  fullName: string;
  jobTitle: string;
  age?: string;
  gender?: string;
  politicalStatus?: string;
  ethnicity?: string;
  hometown?: string;
  maritalStatus?: string;
  yearsOfExperience?: string;
  educationLevel?: string;
  email: string;
  phone: string;
  wechat?: string;
  location: string;
  website?: string;
  linkedin?: string;
  github?: string;
  customLinks?: { label: string; url: string }[];
  avatar?: string;
}

export interface QrCodesContent {
  items: QrCodeItem[];
}

export interface SummaryContent {
  text: string;
}

export interface WorkExperienceItem {
  id: string;
  company: string;
  position: string;
  location?: string;
  startDate: string;
  endDate: string | null;
  current: boolean;
  description: string;
  technologies: string[];
  highlights: string[];
}

export interface WorkExperienceContent {
  items: WorkExperienceItem[];
}

export interface EducationItem {
  id: string;
  institution: string;
  degree: string;
  field: string;
  location?: string;
  startDate: string;
  endDate: string;
  gpa?: string;
  highlights: string[];
}

export interface EducationContent {
  items: EducationItem[];
}

export interface SkillCategory {
  id: string;
  name: string;
  skills: string[];
}

export interface SkillsContent {
  categories: SkillCategory[];
}

export interface ProjectItem {
  id: string;
  name: string;
  url?: string;
  startDate?: string;
  endDate?: string;
  description: string;
  technologies: string[];
  highlights: string[];
}

export interface ProjectsContent {
  items: ProjectItem[];
}

export interface CertificationItem {
  id: string;
  name: string;
  issuer: string;
  date: string;
  url?: string;
}

export interface CertificationsContent {
  items: CertificationItem[];
}

export interface LanguageItem {
  id: string;
  language: string;
  proficiency: string;
  description?: string;
}

export interface LanguagesContent {
  items: LanguageItem[];
}

export interface CustomItem {
  id: string;
  title: string;
  subtitle?: string;
  date?: string;
  description: string;
}

export interface CustomContent {
  items: CustomItem[];
}

export interface GitHubRepoItem {
  id: string;
  repoUrl: string;
  name: string;
  stars: number;
  language: string;
  description: string;
}

export interface GitHubContent {
  items: GitHubRepoItem[];
}

export type SectionContent =
  | PersonalInfoContent
  | SummaryContent
  | WorkExperienceContent
  | EducationContent
  | SkillsContent
  | ProjectsContent
  | CertificationsContent
  | LanguagesContent
  | CustomContent
  | GitHubContent
  | QrCodesContent;

export interface ResumeSection {
  id: string;
  resumeId: string;
  type: string;
  title: string;
  sortOrder: number;
  visible: boolean;
  content: SectionContent;
  createdAt: Date;
  updatedAt: Date;
}

export interface ThemeConfig {
  primaryColor?: string;
  accentColor?: string;
  bodyColor?: string;
  fontFamily?: string;
  fontScheme?: import('@/lib/theme-config').FontSchemeId;
  fontSize?: ThemeFontSize;
  lineSpacing?: number;
  margin?: { top: number; right: number; bottom: number; left: number };
  sectionSpacing?: number;
  dateStyle?: 'dot' | 'dash' | 'cn';
  headingStyle?: 'underline' | 'plain' | 'filled';
  avatarStyle?: 'circle' | 'oneInch';
  infoLayout?: 'inline' | 'grid';
}

export interface ResolvedTheme {
  primaryColor: string;
  accentColor: string;
  bodyColor: string;
  fontScheme: import('@/lib/theme-config').FontSchemeId;
  fontSize: number;
  lineSpacing: number;
  margin: { top: number; right: number; bottom: number; left: number };
  sectionSpacing: number;
  dateStyle: 'dot' | 'dash' | 'cn';
  headingStyle: 'underline' | 'plain' | 'filled';
  avatarStyle: 'circle' | 'oneInch';
  infoLayout: 'inline' | 'grid';
}

export type LegacyFontSize = 'small' | 'medium' | 'large';
export type ThemeFontSize = number | LegacyFontSize;

/** Card-level highlights attached by list_resumes for real content previews. */
export interface ResumeCardSummary {
  fullName: string;
  jobTitle: string;
  latestCompany: string;
  latestPosition: string;
  skills: string[];
  sectionCount: number;
  filledSections: number;
}

export interface Resume {
  id: string;
  userId: string;
  title: string;
  template: string;
  themeConfig: ThemeConfig;
  isDefault: boolean;
  language: string;
  sections: ResumeSection[];
  summary?: ResumeCardSummary;
  createdAt: Date;
  updatedAt: Date;
}

export type ResumeVersionEvent = 'save' | 'ai_accept' | 'ai_reject';

export interface ResumeVersion {
  id: string;
  resumeId: string;
  userId: string;
  event: ResumeVersionEvent;
  resumeTitle: string;
  snapshot: Resume;
  createdAt: number;
}
