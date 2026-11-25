import { PLANS } from "@askwell/shared";
import { Badge, GlassPanel, cx } from "../ui";
import { CtaLink } from "./CtaLink";
import { SIGN_UP_PATH } from "./Hero";
import { LandingSection } from "./Section";
import { Reveal } from "./Reveal";
import { PLAN_NAMES, buildPricingRows, splitPrice } from "./pricing";

export function Pricing() {
  const rows = buildPricingRows();
  return (
    <LandingSection
      id="pricing"
      eyebrow="Pricing"
      title="Start free. Upgrade when it pays off."
    >
      <Reveal>
        <GlassPanel padding="none" className="overflow-x-auto">
          <table className="w-full min-w-[20rem] border-collapse text-left text-sm">
            <caption className="sr-only">Free and Pro plans compared</caption>
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className="w-2/5 p-4 sm:p-6">
                  <span className="sr-only">Feature</span>
                </th>
                {PLANS.map((plan) => {
                  const { amount, per } = splitPrice(plan);
                  return (
                    <th
                      key={plan}
                      scope="col"
                      className={cx(
                        "p-4 align-top sm:p-6",
                        plan === "pro" && "bg-subtle",
                      )}
                    >
                      <span className="flex items-center gap-2 text-base font-semibold">
                        {PLAN_NAMES[plan]}
                        {plan === "pro" && (
                          <Badge variant="solid">Popular</Badge>
                        )}
                      </span>
                      <span className="mt-2 block font-normal">
                        <span className="text-2xl font-semibold sm:text-3xl">
                          {amount}
                        </span>
                        <span className="text-muted">{per}</span>
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.label}
                  className="border-b border-line last:border-b-0"
                >
                  <th
                    scope="row"
                    className="px-4 py-3 font-normal text-muted sm:px-6"
                  >
                    {row.label}
                  </th>
                  {PLANS.map((plan) => (
                    <td
                      key={plan}
                      className={cx(
                        "px-4 py-3 font-medium sm:px-6",
                        plan === "pro" && "bg-subtle",
                      )}
                    >
                      {row.values[plan]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </GlassPanel>
        <div className="mt-8 flex justify-center">
          <CtaLink href={SIGN_UP_PATH} size="lg">
            Start free
          </CtaLink>
        </div>
      </Reveal>
    </LandingSection>
  );
}
