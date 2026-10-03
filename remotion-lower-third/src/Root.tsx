import React from "react";
import { Composition } from "remotion";
import { SpeakerLowerThird } from "./SpeakerLowerThird";
import { SpeakerLowerThirdPreview } from "./SpeakerPreviewScene";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* 1. Full Broadcast Preview Scene */}
      <Composition
        id="SpeakerPreview"
        component={SpeakerLowerThirdPreview}
        durationInFrames={210}
        fps={30}
        width={1920}
        height={1080}
      />

      {/* 2. Connected Composition: Transparent Overlay for OBS / Video Editors */}
      <Composition
        id="SpeakerLowerThirdOverlay"
        component={SpeakerLowerThird}
        durationInFrames={180}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{
          speakerName: "Pastor Henry Odewale",
          roleOrTitle: "Lead Pastor",
          organization: "MakeChurchEazy Church",
          topic: "Sunday Worship Service",
          accentColor: "#2563EB",
          secondaryAccent: "#38BDF8",
        }}
      />
    </>
  );
};
