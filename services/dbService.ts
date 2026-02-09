import { supabase } from '../lib/supabaseClient';
import { User, AssessmentResult, Course, Question } from '../types';

export const dbService = {
  /**
   * Checks if user exists by email, if not creates them.
   * If an 'id' is provided (from Supabase Auth), we try to use it for the public table to keep them in sync.
   */
  async getOrCreateUser(email: string, fullName: string, authId?: string): Promise<User | null> {
    try {
      // 1. Check if user exists in public.users
      const { data: existingUser } = await supabase
        .from('users')
        .select('*')
        .eq('email', email)
        .single();

      if (existingUser) {
        return {
            id: existingUser.id,
            name: existingUser.full_name,
            email: existingUser.email,
            isPro: existingUser.subscription_tier === 'pro'
        };
      }

      // 2. Create new user in public.users
      // If authId is provided, we use it as the ID. Otherwise, Postgres generates one.
      const payload: any = {
        email,
        full_name: fullName,
        subscription_tier: 'free'
      };
      
      if (authId) {
        payload.id = authId;
      }

      const { data: newUser, error } = await supabase
        .from('users')
        .insert(payload)
        .select()
        .single();

      if (error) {
        console.error("Error creating public user record:", error);
        return null;
      }

      return {
        id: newUser.id,
        name: newUser.full_name,
        email: newUser.email,
        isPro: false
      };
    } catch (e) {
      console.error("DB Error:", e);
      return null;
    }
  },

  async saveAssessment(userId: string, result: AssessmentResult, questions: Question[]) {
    try {
        const { data, error } = await supabase.from('assessments').insert({
            user_id: userId,
            topic: result.topic,
            score_overall: result.score,
            knowledge_graph: result.knowledgeGraph,
            questions_data: { questions }, // Store full exam structure
            status: 'completed',
            completed_at: new Date().toISOString()
        }).select().single();
        
        if (error) throw error;
        return data;
    } catch (e) {
        console.error("Failed to save assessment", e);
        return null;
    }
  },

  async hasCompletedAssessment(userId: string): Promise<boolean> {
    try {
        const { count, error } = await supabase
          .from('assessments')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId);
        
        if (error) throw error;
        return (count || 0) > 0;
    } catch (e) {
        console.error("Error checking assessments:", e);
        return false;
    }
  },

  async skipOnboarding(userId: string) {
      try {
          await supabase
            .from('users')
            .update({ has_onboarded: true } as any)
            .eq('id', userId);
      } catch (e) {
          console.warn("Could not update onboarding flag in DB");
      }
  },

  async saveCourse(userId: string, assessmentId: string | undefined, course: Course) {
    try {
        // 1. Create Course Entry
        const { data: courseData, error: courseError } = await supabase.from('courses').insert({
            user_id: userId,
            assessment_id: assessmentId || null,
            title: course.title,
            is_unlocked: true 
        }).select().single();
        
        if (courseError) throw courseError;

        // 2. Create Modules
        const modulesData = course.modules.map((m, index) => ({
            course_id: courseData.id,
            title: m.title,
            content_raw: { 
                content: m.content, 
                type: m.type,
                description: m.description 
            }, 
            order_index: index,
            is_completed: m.isCompleted
        }));

        const { error: modulesError } = await supabase.from('modules').insert(modulesData);
        if (modulesError) throw modulesError;

        return courseData;
    } catch (e) {
        console.error("Failed to save course", e);
        return null;
    }
  },
  
  async updateModuleCompletion(moduleId: string, isCompleted: boolean) {
      const { error } = await supabase
        .from('modules')
        .update({ is_completed: isCompleted })
        .eq('id', moduleId);
        
      if (error) console.error("Error updating module", error);
  }
};