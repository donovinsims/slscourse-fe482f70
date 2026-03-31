CREATE TABLE IF NOT EXISTS public.admin_users (
  email TEXT PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access admin_users" ON public.admin_users;
CREATE POLICY "Service role full access admin_users"
ON public.admin_users
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

INSERT INTO public.admin_users (email)
VALUES
  ('sls25trading@gmail.com'),
  ('emaildonovin@gmail.com'),
  ('donovinsims@gmail.com')
ON CONFLICT (email) DO NOTHING;

DO $$
DECLARE
  lesson JSONB;
  lessons JSONB := jsonb_build_array(
    jsonb_build_object('sort_order', 1, 'module', 'Foundations', 'title', 'Welcome & Course Overview', 'youtube_id', 'e4vjMbwydN8', 'description', 'Start the course with a clear overview of the training and how to use it.'),
    jsonb_build_object('sort_order', 2, 'module', 'Foundations', 'title', 'The Day Trader''s Mindset', 'youtube_id', 'XbnxvNIzXos', 'description', 'Build the mindset and habits needed to approach day trading with discipline.'),
    jsonb_build_object('sort_order', 3, 'module', 'Foundations', 'title', 'Charts, Timeframes & Tools', 'youtube_id', 'CsqWSTEDBss', 'description', 'Learn the charts, timeframes, and core tools used throughout the course.'),
    jsonb_build_object('sort_order', 4, 'module', 'Foundations', 'title', 'Understanding Market Structure', 'youtube_id', 'DtKYGHp0rbY', 'description', 'Understand how market structure shapes trade ideas and decision-making.'),
    jsonb_build_object('sort_order', 5, 'module', 'Market Structure', 'title', 'Support & Resistance Mastery', 'youtube_id', 'NGndbpyLVbE', 'description', 'Break down support and resistance so key levels become easier to read.'),
    jsonb_build_object('sort_order', 6, 'module', 'Market Structure', 'title', 'S&R In Practice', 'youtube_id', 'FGri77Yq3tU', 'description', 'See support and resistance used in practical chart examples and trade planning.'),
    jsonb_build_object('sort_order', 7, 'module', 'Market Structure', 'title', 'M''s & W''s / Chart Patterns', 'youtube_id', '54JAceqXhuM', 'description', 'Learn how common M and W formations fit into the broader market-structure picture.'),
    jsonb_build_object('sort_order', 8, 'module', 'Market Structure', 'title', 'BOS vs CHOC', 'youtube_id', '5Bn1H-fpmPY', 'description', 'Differentiate break of structure from change of character in live chart context.'),
    jsonb_build_object('sort_order', 9, 'module', 'Entries & Setups', 'title', 'High-Probability Entries', 'youtube_id', 'QPPtkoxELyQ', 'description', 'Focus on the entry characteristics that improve trade quality and timing.'),
    jsonb_build_object('sort_order', 10, 'module', 'Entries & Setups', 'title', 'EMA Crossings & Signals', 'youtube_id', 'adVDa-wZoZg', 'description', 'Use EMA crossings and related signals to support cleaner entry decisions.'),
    jsonb_build_object('sort_order', 11, 'module', 'Entries & Setups', 'title', 'Fair Value Gaps', 'youtube_id', 'e8OX64J0XW8', 'description', 'Understand fair value gaps and how they can frame setup opportunities.'),
    jsonb_build_object('sort_order', 12, 'module', 'Entries & Setups', 'title', 'Confluence vs Strategy', 'youtube_id', '3Qxq1hGdASE', 'description', 'Separate true confluence from random confirmation so setups stay consistent.'),
    jsonb_build_object('sort_order', 13, 'module', 'Risk Management', 'title', 'Managing Risk & Securing Profits', 'youtube_id', 'IQ1I4KTfMjs', 'description', 'Learn how to manage downside while protecting gains as trades develop.'),
    jsonb_build_object('sort_order', 14, 'module', 'Risk Management', 'title', 'Taking Profit Options', 'youtube_id', 'w3puLc0Ku38', 'description', 'Review practical ways to scale out and take profits with structure.'),
    jsonb_build_object('sort_order', 15, 'module', 'Risk Management', 'title', 'Liquidity & Stop Placement', 'youtube_id', 'Ld9ex3dT4P8', 'description', 'Place stops with more intent by understanding liquidity and common sweep areas.'),
    jsonb_build_object('sort_order', 16, 'module', 'Risk Management', 'title', 'Payout & Capital Protection', 'youtube_id', 'StAiMkpJgCo', 'description', 'Protect account capital while planning for payouts and long-term consistency.'),
    jsonb_build_object('sort_order', 17, 'module', 'Advanced Strategies', 'title', 'Trading Continuation & Trend', 'youtube_id', 'HkR7qQBXmig', 'description', 'Trade continuation moves and trend conditions with more structure and confidence.'),
    jsonb_build_object('sort_order', 18, 'module', 'Advanced Strategies', 'title', 'Lock and Reload', 'youtube_id', '7kjf4V0qFNw', 'description', 'Use lock-and-reload style trade management to stay aggressive without overexposing.'),
    jsonb_build_object('sort_order', 19, 'module', 'Advanced Strategies', 'title', 'Live Trade Walkthrough', 'youtube_id', 'M0b_9EzBs-A', 'description', 'Walk through a live trade example from idea to execution and review.'),
    jsonb_build_object('sort_order', 20, 'module', 'Advanced Strategies', 'title', 'Prop Firms: Pros & Cons', 'youtube_id', 'plLAKHHYgS4', 'description', 'Evaluate the practical pros and cons of trading with prop firms.'),
    jsonb_build_object('sort_order', 21, 'module', 'Psychology & Review', 'title', 'Eliminate Burnout', 'youtube_id', '0vYM1-RyLjE', 'description', 'Reduce burnout by improving routine, expectations, and decision quality.'),
    jsonb_build_object('sort_order', 22, 'module', 'Psychology & Review', 'title', 'Eliminating Stress & Anxiety', 'youtube_id', 'qfYVtM8IKqc', 'description', 'Handle stress and anxiety so emotions do not take over the trading process.'),
    jsonb_build_object('sort_order', 23, 'module', 'Psychology & Review', 'title', 'Q&A Session 1', 'youtube_id', 'QJB-FS89g5Y', 'description', 'Review common student questions and practical answers from the course.'),
    jsonb_build_object('sort_order', 24, 'module', 'Psychology & Review', 'title', 'Q&A Session 2', 'youtube_id', 'eGxtA8SCPPQ', 'description', 'Continue the course review with additional questions, answers, and clarifications.')
  );
BEGIN
  FOR lesson IN SELECT * FROM jsonb_array_elements(lessons)
  LOOP
    UPDATE public.videos
    SET
      module = lesson->>'module',
      title = lesson->>'title',
      youtube_id = lesson->>'youtube_id',
      sort_order = (lesson->>'sort_order')::INT,
      description = COALESCE(NULLIF(description, ''), lesson->>'description')
    WHERE youtube_id = lesson->>'youtube_id'
       OR sort_order = (lesson->>'sort_order')::INT
       OR title = lesson->>'title';

    IF NOT FOUND THEN
      INSERT INTO public.videos (title, description, youtube_id, sort_order, module)
      VALUES (
        lesson->>'title',
        lesson->>'description',
        lesson->>'youtube_id',
        (lesson->>'sort_order')::INT,
        lesson->>'module'
      );
    END IF;
  END LOOP;
END $$;
