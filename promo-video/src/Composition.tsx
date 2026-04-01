import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { SCENE_DURATIONS, colors } from "./constants";
import { HookScene } from "./scenes/HookScene";
import { ProblemScene } from "./scenes/ProblemScene";
import { QuestionScene } from "./scenes/QuestionScene";
import { SolutionScene } from "./scenes/SolutionScene";
import { FeaturesScene } from "./scenes/FeaturesScene";
import { CTAScene } from "./scenes/CTAScene";

export const PRDockPromo: React.FC = () => {
  let offset = 0;

  const sceneStart = {
    hook: (offset = 0),
    problem: (offset += SCENE_DURATIONS.hook),
    question: (offset += SCENE_DURATIONS.problem),
    solution: (offset += SCENE_DURATIONS.question),
    features: (offset += SCENE_DURATIONS.solution),
    cta: (offset += SCENE_DURATIONS.features),
  };

  return (
    <AbsoluteFill style={{ background: colors.bg }}>
      <Sequence from={sceneStart.hook} durationInFrames={SCENE_DURATIONS.hook}>
        <HookScene />
      </Sequence>

      <Sequence
        from={sceneStart.problem}
        durationInFrames={SCENE_DURATIONS.problem}
      >
        <ProblemScene />
      </Sequence>

      <Sequence
        from={sceneStart.question}
        durationInFrames={SCENE_DURATIONS.question}
      >
        <QuestionScene />
      </Sequence>

      <Sequence
        from={sceneStart.solution}
        durationInFrames={SCENE_DURATIONS.solution}
      >
        <SolutionScene />
      </Sequence>

      <Sequence
        from={sceneStart.features}
        durationInFrames={SCENE_DURATIONS.features}
      >
        <FeaturesScene />
      </Sequence>

      <Sequence from={sceneStart.cta} durationInFrames={SCENE_DURATIONS.cta}>
        <CTAScene />
      </Sequence>
    </AbsoluteFill>
  );
};
