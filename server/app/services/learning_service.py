"""
Learning Service for managing learning paths and progress
"""
from sqlalchemy.orm import Session
from typing import List, Optional
from app import models
from app.services.ai_service import ai_service


class LearningService:
    """
    Service for learning path management and progress tracking
    """
    
    @staticmethod
    async def create_learning_path_with_stages(
        db: Session,
        user_id: int,
        result_id: int,
        track_name: str,
        detected_level: str,
        skill_profile: dict,
        auto_generate_content: bool = True
    ) -> models.LearningPath:
        """
        Create a complete learning path with AI-generated stages
        Optionally auto-generates content for each stage
        """
        # Create the learning path
        learning_path = models.LearningPath(
            user_id=user_id,
            result_id=result_id
        )
        db.add(learning_path)
        db.flush()
        
        # Generate AI-powered learning stages
        stages_data = await ai_service.generate_learning_path(
            skill_profile=skill_profile,
            detected_level=detected_level,
            track_name=track_name
        )
        
        # Create stages
        created_stages = []
        for stage_data in stages_data:
            stage = models.LearningPathStage(
                path_id=learning_path.path_id,
                stage_name=stage_data["stage_name"],
                stage_order=stage_data["stage_order"],
                focus_area=stage_data["focus_area"]
            )
            db.add(stage)
            db.flush()  # Flush to get stage_id
            created_stages.append(stage)
        
        # Auto-generate content for each stage if requested
        if auto_generate_content:
            for stage in created_stages:
                content_items = await ai_service.generate_stage_content(
                    stage_name=stage.stage_name,
                    focus_area=stage.focus_area,
                    difficulty_level=detected_level,
                    track_name=track_name,
                    content_count=8
                )
                
                # Save content to database
                for idx, item in enumerate(content_items, start=1):
                    content = models.StageContent(
                        stage_id=stage.stage_id,
                        content_type=item["content_type"],
                        title=item["title"],
                        description=item["description"],
                        url=item.get("url"),
                        content_text=item.get("content_text"),
                        difficulty_level=item["difficulty_level"],
                        order_index=idx,
                        estimated_duration=item.get("estimated_duration"),
                        source_platform=item.get("source_platform"),
                        tags=item.get("tags")
                    )
                    db.add(content)
        
        db.commit()
        db.refresh(learning_path)
        return learning_path
    
    @staticmethod
    def get_user_current_stage(
        db: Session,
        user_id: int
    ) -> Optional[models.LearningPathStage]:
        """
        Get the user's current learning stage
        """
        # Get user's latest learning path
        learning_path = db.query(models.LearningPath).filter(
            models.LearningPath.user_id == user_id
        ).order_by(models.LearningPath.created_at.desc()).first()
        
        if not learning_path:
            return None
        
        # Get first incomplete stage
        # For now, return first stage (you can add completion tracking later)
        stage = db.query(models.LearningPathStage).filter(
            models.LearningPathStage.path_id == learning_path.path_id
        ).order_by(models.LearningPathStage.stage_order).first()
        
        return stage
    
    @staticmethod
    def get_all_stages_for_path(
        db: Session,
        path_id: int
    ) -> List[models.LearningPathStage]:
        """
        Get all stages for a learning path ordered by stage_order
        """
        return db.query(models.LearningPathStage).filter(
            models.LearningPathStage.path_id == path_id
        ).order_by(models.LearningPathStage.stage_order).all()


# Singleton instance
learning_service = LearningService()

