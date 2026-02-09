import { useState, FC } from 'react';
import { Layout } from './components/Layout';
import { Header } from './components/Header';
import { Home } from './pages/Home';
import { SkillSelection } from './pages/SkillSelection';
import { Assessment } from './pages/Assessment';
import { Dashboard } from './pages/Dashboard';
import { CourseView } from './pages/Course';
import { Validator } from './pages/Validator';
import { Blog } from './pages/Blog';
import { ViewState, User, AssessmentResult, Course } from './types';
import { generateCurriculum } from './services/geminiService';
import { dbService } from './services/dbService';
import { Toast } from './components/Toast';
import { ThemeProvider } from './providers/ThemeProvider';

const App: FC = () => {
  // Create a mock user for demo purposes (no authentication required)
  const mockUser: User = {
    id: 'demo-user-123',
    name: 'Demo User',
    email: 'demo@example.com',
    isPro: false
  };

  const [view, setView] = useState<ViewState>('HOME');
  const [user] = useState<User | null>(mockUser);
  const [selectedTopic, setSelectedTopic] = useState<string>('React');
  const [assessmentResult, setAssessmentResult] = useState<AssessmentResult | null>(null);
  const [course, setCourse] = useState<Course | null>(null);
  const [isGeneratingCourse, setIsGeneratingCourse] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Global Sidebar State (for Dashboard layout)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const handleLogout = () => {
    // No-op since we're not using auth
    setView('HOME');
  };

  const handleSkillSelected = (topic: string) => {
    setSelectedTopic(topic);
    setView('ASSESSMENT_ACTIVE');
  };

  const handleAssessmentComplete = (result: AssessmentResult) => {
    setAssessmentResult(result);
    // Extract the questions from the result object (casted hack from Assessment.tsx)
    const questions = (result as any).questions || [];
    // Try to save assessment, but don't fail if DB is not available
    if (user) {
      dbService.saveAssessment(user.id, result, questions).catch(err => {
        console.warn('Could not save assessment to database:', err);
      });
    }
    setView('DASHBOARD');
  };

  const handleGenerateCourse = async () => {
    if (!assessmentResult) return;
    setIsGeneratingCourse(true);
    try {
      await new Promise(r => setTimeout(r, 2000));
      // Mock Pro Upgrade for demo
      setUser(u => u ? ({ ...u, isPro: true }) : null);
      const newCourse = await generateCurriculum(assessmentResult.topic, assessmentResult.weaknesses);
      setCourse(newCourse);
      // Curriculum page is disabled - stay on Dashboard
      setToastMessage("Course generated successfully! (Curriculum page is currently disabled)");
    } catch (e) {
      alert("Failed to generate course");
      console.error(e);
    } finally {
      setIsGeneratingCourse(false);
    }
  };

  // Routing Switch - Equivalent to Next.js App Router Page rendering
  const renderContent = () => {
    switch (view) {
      case 'HOME':
        return (
          <Home
            onStart={() => setView('DASHBOARD')}
            onLoginClick={() => setView('DASHBOARD')}
            user={user}
            onDashboardClick={() => setView('DASHBOARD')}
            onBlogClick={() => setView('BLOG')}
            onDemoClick={() => setView('SKILL_SELECTION')}
          />
        );

      case 'BLOG':
        return <Blog onBack={() => setView('HOME')} />;

      case 'SKILL_SELECTION':
        return (
          <SkillSelection
            onSelect={handleSkillSelected}
            onBack={() => setView('HOME')}
            onSkip={() => {
              if (user) {
                localStorage.setItem(`gw_skip_${user.id}`, 'true');
                dbService.skipOnboarding(user.id);
              }
              setView('DASHBOARD');
            }}
          />
        );

      case 'ASSESSMENT_ACTIVE':
        return (
          <Assessment
            topic={selectedTopic}
            onComplete={handleAssessmentComplete}
            onExit={() => setView('HOME')}
          />
        );

      case 'DASHBOARD':
      case 'ASSESSMENT_RESULT':
        return (
          <Layout
            activeView="DASHBOARD"
            onNavigate={setView}
            user={user}
            onLogout={handleLogout}
            isSidebarOpen={isSidebarOpen}
            onSidebarClose={() => setIsSidebarOpen(false)}
          >
            <Dashboard
              user={user}
              result={assessmentResult}
              onGenerateCourse={handleGenerateCourse}
              isGenerating={isGeneratingCourse}
              onStartAssessment={() => setView('SKILL_SELECTION')}
            />
          </Layout>
        );

      case 'COURSE_VIEW':
        // Curriculum page is disabled - redirect to Dashboard
        setView('DASHBOARD');
        return null;

      case 'VALIDATOR':
        return (
          <Layout
            activeView="VALIDATOR"
            onNavigate={setView}
            user={user}
            onLogout={handleLogout}
            isSidebarOpen={isSidebarOpen}
            onSidebarClose={() => setIsSidebarOpen(false)}
          >
            <Validator />
          </Layout>
        );

      default:
        return <div>View not found</div>;
    }
  };

  return (
    <ThemeProvider defaultTheme="system" storageKey="grow-wise-theme">
      {/* Root Layout Wrapper */}
      <div className="antialiased text-gray-900 dark:text-gray-100 bg-background min-h-screen font-sans">
        {toastMessage && <Toast message={toastMessage} onClose={() => setToastMessage(null)} />}

        {/* Global Header */}
        <Header
          user={user}
          activeView={view}
          onNavigate={setView}
          onLoginClick={() => setView('DASHBOARD')}
          onLogout={handleLogout}
          onDashboardClick={() => setView('DASHBOARD')}
          onMenuToggle={() => setIsSidebarOpen(!isSidebarOpen)}
        />

        {/* Page Content */}
        {renderContent()}
      </div>
    </ThemeProvider>
  );
};

export default App;