Feature: Harmony detection

  A photograph either shows one of the classical color harmonies or it does
  not, so that is the answer — the name of the harmony and the colors that
  form it, or nothing. Colors are on an ideal position if they sit within the
  tolerance of it, since nobody grades to the degree. Only colors that cover
  enough of the frame and carry a real hue take part, and every one of them has
  to sit on the shape: a color that counts and sits nowhere on it is what makes
  the answer no.

  Scenario: Complementary harmony detected
    Given dominant colors at hues 0 and 180
    When harmony detection runs
    Then the harmony is complementary
    And it is formed by the colors at positions 0 and 1

  Scenario: Grading by eye still counts
    Given dominant colors at hues 0 and 172
    When harmony detection runs
    Then the harmony is complementary

  Scenario: The shape may sit anywhere on the wheel
    Given dominant colors at hues 0 and 165
    When harmony detection runs
    Then the harmony is complementary

  Scenario: Past the tolerance the pair is only close
    Given dominant colors at hues 0 and 159
    When harmony detection runs
    Then the harmony is complementary
    And the frame is only close to it

  Scenario: The template that fits tightest is the one reported
    Given dominant colors at hues 0, 71, 180 and 251
    When harmony detection runs
    Then the harmony is tetradic

  Scenario: A shape stretched out of proportion is close, not exact
    Given dominant colors at hues 0, 132 and 228
    When harmony detection runs
    Then the harmony is triadic
    And the frame is only close to it

  Scenario: Triadic harmony detected
    Given dominant colors at hues 0, 120 and 240
    When harmony detection runs
    Then the harmony is triadic
    And it is formed by 3 colors

  Scenario: Split-complementary harmony detected
    Given dominant colors at hues 0, 150 and 210
    When harmony detection runs
    Then the harmony is split-complementary

  Scenario: Analogous harmony detected
    Given dominant colors at hues 30, 58 and 88
    When harmony detection runs
    Then the harmony is analogous

  Scenario: Neighbouring hues at any spacing are analogous
    Given dominant colors at hues 20, 35 and 50
    When harmony detection runs
    Then the harmony is analogous

  Scenario: Two neighbouring hues are analogous
    Given dominant colors at hues 30 and 60
    When harmony detection runs
    Then the harmony is analogous

  Scenario: An analogous run across the 360 boundary
    Given dominant colors at hues 350, 10 and 20
    When harmony detection runs
    Then the harmony is analogous
    And it connects the colors in the order they sit along the arc

  Scenario: Past the arc they stop being neighbours
    Given dominant colors at hues 0 and 70
    When harmony detection runs
    Then no harmony is reported

  Scenario: Square harmony detected
    Given dominant colors at hues 0, 90, 180 and 270
    When harmony detection runs
    Then the harmony is square
    And it is formed by 4 colors

  Scenario: Tetradic harmony detected
    Given dominant colors at hues 0, 60, 180 and 240
    When harmony detection runs
    Then the harmony is tetradic

  Scenario: A color the shape does not reach makes the answer no
    Given dominant colors at hues 0, 9, 18 and 180
    When harmony detection runs
    Then no harmony is reported

  Scenario: A color off the shape makes the answer no
    Given dominant colors at hues 0, 120, 240 and 55
    When harmony detection runs
    Then no harmony is reported

  Scenario: Hues either side of the 360 boundary are one hue, not opposites
    Given dominant colors at hues 359 and 1
    When harmony detection runs
    Then the harmony is monochromatic

  Scenario: A trace color neither completes a harmony nor breaks one
    Given a palette of hue 0 at weight 0.48, hue 180 at weight 0.48 and hue 90 at weight 0.04
    When harmony detection runs
    Then the harmony is complementary
    And it is formed by 2 colors

  Scenario: A gray carries no hue to place
    Given dominant colors at hues 0 and 180, and a third at hue 90 with 3 percent saturation
    When harmony detection runs
    Then the harmony is complementary

  Scenario: A desaturated palette shows no harmony
    Given dominant colors at hues 0, 120 and 240, all at 4 percent saturation
    When harmony detection runs
    Then no harmony is reported

  Scenario: A cluster of near-identical hues is one hue
    Given dominant colors at hues 0, 8 and 16
    When harmony detection runs
    Then the harmony is monochromatic

  Scenario: The order the colors arrive in does not change the answer
    Given dominant colors at hues 16, 8 and 0
    When harmony detection runs
    Then the harmony is monochromatic

  Scenario: A single dominant color is monochromatic
    Given dominant colors at hues 210
    When harmony detection runs
    Then the harmony is monochromatic

  Scenario: Scattered hues show no harmony
    Given dominant colors at hues 12, 88, 133, 196, 271 and 338
    When harmony detection runs
    Then no harmony is reported

  Scenario: An empty palette shows no harmony
    Given an empty palette
    When harmony detection runs
    Then no harmony is reported

  Scenario: Detection stays inside the frame budget
    Given dominant colors at hues 12, 88, 133, 196, 271 and 338
    When harmony detection runs
    Then detection completed in under 5 milliseconds

  Scenario: A shadow does not vote on harmony
    Given dominant colors at hues 0, 120 and 240 plus a near-black at hue 55
    When harmony detection runs
    Then the harmony is triadic
    And it is formed by 3 colors

  Scenario: A blown highlight does not vote either
    Given dominant colors at hues 0, 120 and 240 plus a near-white at hue 55
    When harmony detection runs
    Then the harmony is triadic
    And it is formed by 3 colors

  Scenario: One color short of a triad
    Given dominant colors at hues 0, 120 and 268
    When harmony detection runs
    Then the harmony is triadic
    And the frame is only close to it
    And the color at position 2 is named as the one out of place

  Scenario: A frame near nothing still claims nothing
    Given dominant colors at hues 0, 60 and 150
    When harmony detection runs
    Then no harmony is reported

  Scenario: A shape that fits exactly is not called close
    Given dominant colors at hues 0, 120 and 240
    When harmony detection runs
    Then the harmony is triadic
    And the frame is not merely close to it
