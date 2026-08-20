import type { FoundationCatalogItem as CatalogItem } from './a1-a2.v2';

type AdvancedLevel = 'C1' | 'C2';

function make(
  code: string,
  family: string,
  cefr: AdvancedLevel,
  title: string,
  objectiveVi: string,
  objectiveEn: string,
  patterns: string[],
  uses: string[],
  prerequisites: string[],
  rule: string,
  samples: Array<[string, string]>,
  error: CatalogItem['error'],
  exercise: CatalogItem['exercise'],
): CatalogItem {
  const types: CatalogItem['examples'][number][0][] = ['AFFIRMATIVE', 'CONTEXTUAL', 'CONTRASTIVE'];
  return {
    code,
    family,
    cefr,
    title,
    objectiveVi,
    objectiveEn,
    patterns,
    uses,
    prerequisites,
    rule,
    examples: samples.map(([english, vietnamese], index) => [types[index]!, english, vietnamese]),
    error,
    exercise,
  };
}

export const advancedCatalog: CatalogItem[] = [
  make(
    'INVERSION_NEGATIVE_ADVERBIALS',
    'INVERSION',
    'C1',
    'Đảo ngữ sau trạng từ phủ định',
    'Dùng đảo trợ động từ sau trạng từ phủ định hoặc hạn định để tạo nhấn mạnh trang trọng.',
    'Use subject–auxiliary inversion after negative or restrictive adverbials for formal emphasis.',
    [
      'negative adverbial + auxiliary + subject + main verb',
      'not until + clause + auxiliary + subject + verb',
    ],
    ['Emphasise the exceptional nature of an event.', 'Create formal rhetorical focus.'],
    ['PAST_PERFECT_SEQUENCE', 'MODAL_DEDUCTION_PRESENT_PAST'],
    'When a negative or restrictive adverbial is fronted, place the auxiliary before the subject in the main clause.',
    [
      [
        'Never have I seen such a rapid change.',
        'Tôi chưa bao giờ chứng kiến sự thay đổi nhanh đến vậy.',
      ],
      [
        'Not until the data was checked did we notice the error.',
        'Mãi đến khi dữ liệu được kiểm tra, chúng tôi mới nhận ra lỗi.',
      ],
      [
        'Rarely does the committee reach a unanimous decision.',
        'Hiếm khi ủy ban đạt được quyết định nhất trí.',
      ],
    ],
    [
      'Never I have seen this before.',
      'Never have I seen this before.',
      'Sau never đứng đầu câu cần đảo have lên trước chủ ngữ.',
    ],
    {
      contextVi: 'Bạn nhấn mạnh một trải nghiệm chưa từng có trong báo cáo.',
      sourceVi: 'Chưa bao giờ chúng tôi gặp một vấn đề phức tạp đến vậy.',
      answers: [
        'Never have we encountered such a complex problem.',
        'Never have we faced such a complex problem.',
      ],
      requirements: ['Front a negative adverbial.', 'Use subject–auxiliary inversion.'],
      vocabulary: [
        'encounter',
        'verb',
        'gặp phải',
        'Đối mặt hoặc bất ngờ gặp một vấn đề hay tình huống.',
        'encounter a complex problem — gặp một vấn đề phức tạp',
      ],
    },
  ),
  make(
    'CLEFT_SENTENCES_FOCUS',
    'INFORMATION_STRUCTURE',
    'C1',
    'Câu chẻ để tạo trọng tâm',
    'Dùng it-cleft và wh-cleft để đặt trọng tâm rõ ràng vào thành phần quan trọng.',
    'Use it-clefts and wh-clefts to place explicit focus on an important constituent.',
    ['it + be + focused element + that/who + clause', 'what + clause + be + focused element'],
    ['Correct or contrast one element.', 'Organise new information as the focus.'],
    ['RELATIVE_CLAUSES_DEFINING'],
    'The cleft clause must preserve the proposition of its neutral counterpart while changing information focus.',
    [
      ['It was Lan who discovered the mistake.', 'Chính Lan là người phát hiện lỗi.'],
      ['What we need is a practical solution.', 'Điều chúng ta cần là một giải pháp thực tế.'],
      [
        'It is the timing that concerns me, not the cost.',
        'Chính thời điểm làm tôi lo, không phải chi phí.',
      ],
    ],
    [
      'It was Lan which called me.',
      'It was Lan who called me.',
      'Khi thành phần được nhấn mạnh là người, dùng who hoặc that.',
    ],
    {
      contextVi: 'Bạn sửa lại người đã đưa ra đề xuất.',
      sourceVi: 'Chính Minh là người đề xuất thay đổi này.',
      answers: ['It was Minh who proposed this change.', 'It was Minh that suggested this change.'],
      requirements: ['Use an it-cleft.', 'Focus Minh as the person responsible.'],
      vocabulary: [
        'propose',
        'verb',
        'đề xuất',
        'Đưa ra một ý tưởng hoặc kế hoạch để xem xét.',
        'propose a change — đề xuất một thay đổi',
      ],
    },
  ),
  make(
    'PARTICIPLE_CLAUSES',
    'NONFINITE_CLAUSES',
    'C1',
    'Mệnh đề phân từ rút gọn',
    'Rút gọn mệnh đề trạng ngữ bằng hiện tại phân từ, quá khứ phân từ hoặc perfect participle khi chủ thể rõ ràng.',
    'Reduce adverbial clauses with present, past, or perfect participles when subject reference is clear.',
    [
      'verb-ing clause, main clause',
      'past-participle clause, main clause',
      'having + past participle, main clause',
    ],
    [
      'Compress simultaneous or causal information.',
      'Mark an action completed before the main event.',
    ],
    ['PAST_PERFECT_SEQUENCE', 'PASSIVE_ADVANCED_FORMS'],
    'The understood subject of the participle clause must normally match the subject of the main clause.',
    [
      ['Walking home, I noticed the new café.', 'Khi đi bộ về nhà, tôi để ý quán cà phê mới.'],
      [
        'Designed for small teams, the tool is easy to use.',
        'Được thiết kế cho nhóm nhỏ, công cụ này dễ dùng.',
      ],
      [
        'Having completed the review, we published the report.',
        'Sau khi hoàn tất việc rà soát, chúng tôi công bố báo cáo.',
      ],
    ],
    [
      'Driving to work, the rain started.',
      'Driving to work, I saw the rain start.',
      'Mệnh đề phân từ không được tạo chủ ngữ lơ lửng; người lái phải là chủ ngữ câu chính.',
    ],
    {
      contextVi: 'Bạn viết gọn hai hành động nối tiếp trong báo cáo.',
      sourceVi: 'Sau khi phân tích dữ liệu, nhóm đã thay đổi chiến lược.',
      answers: [
        'Having analysed the data, the team changed its strategy.',
        'Having analyzed the data, the team revised its strategy.',
      ],
      requirements: [
        'Use a perfect participle clause.',
        'Keep the team as the understood subject.',
      ],
      vocabulary: [
        'strategy',
        'noun',
        'chiến lược',
        'Kế hoạch tổng thể để đạt một mục tiêu.',
        'revise a strategy — điều chỉnh chiến lược',
      ],
    },
  ),
  make(
    'NOMINALISATION_FORMAL_STYLE',
    'FORMAL_STYLE',
    'C1',
    'Danh hóa trong văn phong trang trọng',
    'Chuyển một số hành động hoặc tính chất thành cụm danh từ để viết cô đọng và trang trọng mà vẫn rõ tác nhân.',
    'Use nominalisation for concise formal writing while keeping agency and meaning clear.',
    [
      'the + noun form + of + complement',
      'possessive/determiner + noun form + prepositional complement',
    ],
    ['Package a process as a concept.', 'Create cohesion in formal analysis.'],
    ['PASSIVE_ADVANCED_FORMS'],
    'Nominalisation must not obscure a necessary agent or create an unnecessarily dense noun phrase.',
    [
      [
        'The committee rejected the plan. → The committee’s rejection of the plan was unexpected.',
        'Ủy ban bác bỏ kế hoạch. → Việc ủy ban bác bỏ kế hoạch là điều bất ngờ.',
      ],
      ['A reduction in costs improved performance.', 'Việc giảm chi phí đã cải thiện hiệu suất.'],
      [
        'The rapid expansion of the service created new risks.',
        'Sự mở rộng nhanh của dịch vụ tạo ra rủi ro mới.',
      ],
    ],
    [
      'The decide of the board caused concern.',
      'The decision of the board caused concern.',
      'Danh từ của decide là decision, không phải decide.',
    ],
    {
      contextVi: 'Bạn chuyển một nhận xét thành văn phong báo cáo.',
      sourceVi: 'Việc công ty mở rộng nhanh đã gây áp lực lên nhân viên.',
      answers: [
        "The company's rapid expansion put pressure on its staff.",
        'The rapid expansion of the company placed pressure on employees.',
      ],
      requirements: [
        'Use a nominalised form of expand.',
        'Keep the company as the source of expansion.',
      ],
      vocabulary: [
        'expansion',
        'noun',
        'sự mở rộng',
        'Quá trình trở nên lớn hơn về quy mô hoặc phạm vi.',
        'rapid expansion — sự mở rộng nhanh',
      ],
    },
  ),
  make(
    'MANDATIVE_SUBJUNCTIVE',
    'SUBJUNCTIVE',
    'C1',
    'Subjunctive sau yêu cầu và đề xuất',
    'Dùng dạng nguyên mẫu trong mệnh đề that sau động từ hoặc tính từ chỉ yêu cầu, đề xuất và tính cấp thiết.',
    'Use the base-form mandative subjunctive in that-clauses after demands, recommendations, and expressions of urgency.',
    [
      'verb/adjective of demand + that + subject + base verb',
      'it is essential that + subject + base verb',
    ],
    ['State a formal recommendation.', 'Express a requirement or urgent necessity.'],
    ['REPORTED_SPEECH_STATEMENTS', 'MODALS_OBLIGATION_ADVICE'],
    'Use the uninflected base verb in the mandative that-clause, including be for every subject.',
    [
      ['They recommended that she apply immediately.', 'Họ đề nghị cô ấy nộp đơn ngay.'],
      [
        'It is essential that every member be present.',
        'Điều thiết yếu là mọi thành viên phải có mặt.',
      ],
      [
        'The chair insisted that the vote take place today.',
        'Chủ tọa yêu cầu cuộc bỏ phiếu diễn ra hôm nay.',
      ],
    ],
    [
      'They suggested that he applies now.',
      'They suggested that he apply now.',
      'Trong mandative subjunctive dùng dạng nguyên mẫu apply.',
    ],
    {
      contextVi: 'Bạn ghi một yêu cầu trang trọng trong biên bản.',
      sourceVi: 'Ủy ban yêu cầu mọi báo cáo phải được nộp đúng hạn.',
      answers: [
        'The committee requires that every report be submitted on time.',
        'The committee requested that all reports be submitted on time.',
      ],
      requirements: ['Use a mandative subjunctive that-clause.', 'Use passive be submitted.'],
      vocabulary: [
        'submit',
        'verb',
        'nộp',
        'Chính thức gửi tài liệu để xem xét.',
        'submit a report on time — nộp báo cáo đúng hạn',
      ],
    },
  ),
  make(
    'ADVANCED_HEDGING',
    'STANCE',
    'C1',
    'Hedging trong lập luận',
    'Điều chỉnh mức độ chắc chắn bằng modal, trạng từ và cấu trúc chứng cứ để tránh khẳng định quá mức.',
    'Calibrate certainty with modals, adverbs, and evidential structures to avoid overclaiming.',
    [
      'subject + may/might/appears to + proposition',
      'it seems/is likely that + clause',
      'evidence suggests that + clause',
    ],
    ['Present a cautious interpretation.', 'Separate evidence from certainty.'],
    ['MODAL_DEDUCTION_PRESENT_PAST'],
    'Choose a hedge whose strength matches the available evidence and do not combine incompatible certainty markers.',
    [
      [
        'The results may indicate a change in behaviour.',
        'Kết quả có thể cho thấy sự thay đổi hành vi.',
      ],
      ['It appears that demand is slowing.', 'Có vẻ như nhu cầu đang chậm lại.'],
      [
        'The evidence strongly suggests that the policy was effective.',
        'Bằng chứng cho thấy khá rõ rằng chính sách có hiệu quả.',
      ],
    ],
    [
      'The results definitely might show a trend.',
      'The results might show a trend.',
      'Definitely và might biểu thị mức chắc chắn xung đột trong cùng phát biểu.',
    ],
    {
      contextVi: 'Bạn trình bày kết luận thận trọng từ dữ liệu còn hạn chế.',
      sourceVi: 'Dữ liệu này có thể cho thấy khách hàng đang thay đổi thói quen.',
      answers: [
        'These data may suggest that customers are changing their habits.',
        'This data might indicate that customers are changing their habits.',
      ],
      requirements: [
        'Use an appropriately cautious hedge.',
        'Do not present the interpretation as certain.',
      ],
      vocabulary: [
        'indicate',
        'verb',
        'cho thấy',
        'Cung cấp dấu hiệu hoặc bằng chứng về một điều.',
        'indicate a change — cho thấy một thay đổi',
      ],
    },
  ),
  make(
    'ELLIPSIS_SUBSTITUTION',
    'COHESION',
    'C1',
    'Lược bỏ và thay thế để liên kết câu',
    'Dùng ellipsis, one/ones, do so và trợ động từ thay thế để tránh lặp mà vẫn rõ nghĩa.',
    'Use ellipsis and substitution with one/ones, do so, and auxiliaries to avoid repetition while preserving clarity.',
    [
      'noun substitution: one/ones',
      'verb-phrase substitution: do so',
      'auxiliary + too/so/neither',
    ],
    ['Avoid repeated noun or verb phrases.', 'Create concise cohesion across clauses.'],
    ['PRESENT_SIMPLE_VS_CONTINUOUS'],
    'The omitted or substituted material must have one clear recoverable antecedent.',
    [
      ['I prefer the smaller one.', 'Tôi thích cái nhỏ hơn.'],
      [
        'They promised to revise the plan and did so the next day.',
        'Họ hứa sửa kế hoạch và đã làm vậy vào hôm sau.',
      ],
      ['Mai can attend, and so can I.', 'Mai có thể tham dự và tôi cũng vậy.'],
    ],
    [
      'I need new batteries because these ones is dead.',
      'I need new batteries because these ones are dead.',
      'Ones là số nhiều nên động từ phải là are.',
    ],
    {
      contextVi: 'Bạn tránh lặp lại cả cụm động từ.',
      sourceVi: 'Họ hứa sẽ giảm chi phí và đã làm vậy trong năm đó.',
      answers: ['They promised to reduce costs and did so that year.'],
      requirements: ['Use do so as verb-phrase substitution.', 'Keep the time reference.'],
      vocabulary: [
        'reduce',
        'verb',
        'giảm',
        'Làm cho số lượng, mức độ hoặc kích thước nhỏ hơn.',
        'reduce costs — giảm chi phí',
      ],
    },
  ),
  make(
    'FRONTING_TOPICALISATION',
    'INFORMATION_STRUCTURE',
    'C1',
    'Fronting và topicalisation',
    'Đưa bổ ngữ hoặc trạng ngữ lên đầu câu để nối chủ đề hoặc tạo đối lập có kiểm soát.',
    'Front complements or adjuncts to manage topic continuity or controlled contrast.',
    ['fronted complement + subject + verb', 'fronted adjunct + clause'],
    ['Maintain discourse topic.', 'Contrast two perspectives or categories.'],
    ['CLEFT_SENTENCES_FOCUS'],
    'Fronting must have a clear discourse motivation and preserve grammatical relations in the remaining clause.',
    [
      [
        'This problem, we can solve immediately.',
        'Vấn đề này thì chúng ta có thể giải quyết ngay.',
      ],
      ['More difficult was the question of funding.', 'Khó hơn là vấn đề kinh phí.'],
      [
        'In the second category, we include indirect costs.',
        'Trong nhóm thứ hai, chúng tôi bao gồm chi phí gián tiếp.',
      ],
    ],
    [
      'The new policy, affects every employee.',
      'The new policy affects every employee.',
      'Không tách chủ ngữ thông thường khỏi động từ bằng dấu phẩy nếu không có cấu trúc topic rõ ràng.',
    ],
    {
      contextVi: 'Bạn đối lập hai phần của một vấn đề trong thuyết trình.',
      sourceVi: 'Phần kỹ thuật thì chúng ta có thể giải quyết; phần tài chính thì khó hơn.',
      answers: [
        'The technical side, we can solve; the financial side is more difficult.',
        'The technical aspect we can address; more difficult is the financial one.',
      ],
      requirements: [
        'Use motivated fronting for contrast.',
        'Preserve the contrast between technical and financial aspects.',
      ],
      vocabulary: [
        'aspect',
        'noun',
        'khía cạnh',
        'Một phần hoặc góc nhìn của một vấn đề.',
        'the technical aspect — khía cạnh kỹ thuật',
      ],
    },
  ),
  make(
    'COMPLEX_PREPOSITIONAL_PHRASES',
    'COMPLEX_PHRASES',
    'C1',
    'Cụm giới từ phức trong lập luận',
    'Dùng các cụm như in light of, with regard to và by means of đúng quan hệ nghĩa và register.',
    'Use complex prepositional phrases such as in light of, with regard to, and by means of with accurate relation and register.',
    ['in light of + noun phrase', 'with regard to + noun phrase', 'by means of + noun phrase'],
    ['Frame a conclusion from evidence.', 'Specify topic, method, concession, or cause precisely.'],
    ['NOMINALISATION_FORMAL_STYLE'],
    'Select the phrase by semantic relation, not merely as a formal replacement for a simple preposition.',
    [
      [
        'In light of the new evidence, we reopened the review.',
        'Xét theo bằng chứng mới, chúng tôi mở lại việc rà soát.',
      ],
      ['With regard to costs, the proposal remains unclear.', 'Về chi phí, đề xuất vẫn chưa rõ.'],
      ['The signal was transmitted by means of a satellite.', 'Tín hiệu được truyền bằng vệ tinh.'],
    ],
    [
      'Despite of the delay, we continued.',
      'Despite the delay, we continued.',
      'Despite không đi với of; cụm đúng là in spite of.',
    ],
    {
      contextVi: 'Bạn điều chỉnh quyết định dựa trên thông tin mới.',
      sourceVi: 'Xét theo những phát hiện mới, chúng ta nên xem xét lại kế hoạch.',
      answers: ['In light of the new findings, we should reconsider the plan.'],
      requirements: [
        'Use in light of to express the evidential basis.',
        'Keep the recommendation appropriately modal.',
      ],
      vocabulary: [
        'finding',
        'noun',
        'phát hiện',
        'Kết quả được tìm thấy qua nghiên cứu hoặc điều tra.',
        'new findings — những phát hiện mới',
      ],
    },
  ),
  make(
    'NARRATIVE_TENSE_MIXING',
    'NARRATIVE_DISCOURSE',
    'C1',
    'Phối hợp thì trong tường thuật',
    'Phối hợp past simple, past continuous và past perfect để phân tầng sự kiện, bối cảnh và hồi tưởng.',
    'Coordinate past simple, past continuous, and past perfect to layer events, background, and flashback.',
    [
      'background: was/were + verb-ing',
      'main events: past simple',
      'earlier events: had + past participle',
    ],
    [
      'Control foreground and background in a narrative.',
      'Move to an earlier time without losing sequence.',
    ],
    ['PAST_CONTINUOUS_INTERRUPTED', 'PAST_PERFECT_SEQUENCE'],
    'Tense shifts must follow changes in temporal viewpoint rather than vary only for stylistic effect.',
    [
      [
        'The wind was rising as we reached the house.',
        'Gió đang mạnh lên khi chúng tôi đến ngôi nhà.',
      ],
      [
        'I recognised the room because I had seen it in a photograph.',
        'Tôi nhận ra căn phòng vì đã thấy nó trong ảnh.',
      ],
      [
        'While everyone was sleeping, the alarm went off.',
        'Trong khi mọi người đang ngủ, chuông báo động vang lên.',
      ],
    ],
    [
      'I had opened the door and was entered the room.',
      'I opened the door and entered the room.',
      'Các sự kiện chính nối tiếp nhau dùng quá khứ đơn.',
    ],
    {
      contextVi: 'Bạn kể một cảnh có bối cảnh, sự kiện chính và ký ức trước đó.',
      sourceVi: 'Trời đang mưa khi tôi đến ngôi nhà mà tôi đã thấy trong bức ảnh.',
      answers: [
        'It was raining when I reached the house that I had seen in the photograph.',
        'It was raining when I arrived at the house I had seen in the photo.',
      ],
      requirements: [
        'Use past continuous for background.',
        'Use past simple for arrival and past perfect for the earlier sighting.',
      ],
      vocabulary: [
        'photograph',
        'noun',
        'bức ảnh',
        'Hình ảnh được tạo bằng máy ảnh.',
        'in the photograph — trong bức ảnh',
      ],
    },
  ),
  make(
    'CONDITIONAL_INVERSION_WITHOUT_IF',
    'INVERSION',
    'C2',
    'Đảo ngữ điều kiện không dùng if',
    'Dùng had, were hoặc should đảo lên trước chủ ngữ để tạo điều kiện trang trọng không có if.',
    'Use inverted had, were, or should to form formal conditional clauses without if.',
    [
      'had + subject + past participle, result',
      'were + subject + complement/to-infinitive, result',
      'should + subject + base verb, result',
    ],
    ['Express formal counterfactual conditions.', 'State a polite or remote future condition.'],
    ['THIRD_CONDITIONAL', 'INVERSION_NEGATIVE_ADVERBIALS'],
    'Remove if only when had, were, or should is inverted before the subject and the original conditional meaning remains clear.',
    [
      [
        'Had we known earlier, we would have acted differently.',
        'Nếu biết sớm hơn, chúng tôi đã hành động khác.',
      ],
      [
        'Were the situation to change, we would review the decision.',
        'Nếu tình hình thay đổi, chúng tôi sẽ xem xét lại quyết định.',
      ],
      ['Should you require assistance, please contact us.', 'Nếu cần hỗ trợ, xin hãy liên hệ.'],
    ],
    [
      'Had we knew, we would have acted.',
      'Had we known, we would have acted.',
      'Sau had đảo ngữ cần quá khứ phân từ known.',
    ],
    {
      contextVi: 'Bạn viết điều kiện lịch sự trong thư trang trọng.',
      sourceVi: 'Nếu bạn cần thêm thông tin, xin hãy liên hệ với tôi.',
      answers: [
        'Should you require further information, please contact me.',
        'Should you need any further information, please contact me.',
      ],
      requirements: ['Use conditional inversion with should.', 'Do not use if.'],
      vocabulary: [
        'require',
        'verb',
        'cần',
        'Cần một điều như một yêu cầu hoặc điều kiện.',
        'require further information — cần thêm thông tin',
      ],
    },
  ),
  make(
    'PSEUDO_CLEFT_NUANCE',
    'INFORMATION_STRUCTURE',
    'C2',
    'Pseudo-cleft và reversed pseudo-cleft',
    'Chọn pseudo-cleft thuận hoặc đảo để kiểm soát nhịp thông tin, tương phản và trọng tâm tinh tế.',
    'Choose regular or reversed pseudo-clefts to control information flow, contrast, and nuanced focus.',
    [
      'what-clause + be + focus',
      'focus + be + what-clause',
      'the reason why + clause + be + focus',
    ],
    [
      'Delay a complex focus until clause end.',
      'Place a contrastive focus first when context supports it.',
    ],
    ['CLEFT_SENTENCES_FOCUS', 'FRONTING_TOPICALISATION'],
    'The focused constituent must be semantically equivalent to the gap in the wh-clause.',
    [
      [
        'What concerns me most is the lack of evidence.',
        'Điều khiến tôi lo nhất là thiếu bằng chứng.',
      ],
      [
        'A complete redesign is what the system needs.',
        'Một thiết kế lại toàn diện mới là điều hệ thống cần.',
      ],
      [
        'The reason why we withdrew was that the risk had increased.',
        'Lý do chúng tôi rút lui là rủi ro đã tăng.',
      ],
    ],
    [
      'What she did was resigned.',
      'What she did was resign.',
      'Sau what she did was thường dùng động từ nguyên mẫu để nêu hành động trọng tâm.',
    ],
    {
      contextVi: 'Bạn nhấn mạnh giải pháp thực sự cần thiết.',
      sourceVi: 'Điều dự án cần là một đánh giá độc lập.',
      answers: [
        'What the project needs is an independent review.',
        'An independent review is what the project needs.',
      ],
      requirements: [
        'Use a pseudo-cleft or reversed pseudo-cleft.',
        'Focus an independent review.',
      ],
      vocabulary: [
        'independent',
        'adjective',
        'độc lập',
        'Không bị chi phối bởi bên có lợi ích trong kết quả.',
        'an independent review — một đánh giá độc lập',
      ],
    },
  ),
  make(
    'MODALITY_FINE_GRAINED_STANCE',
    'STANCE',
    'C2',
    'Modality và stance tinh tế',
    'Kết hợp modal, lexical stance và phạm vi phủ định để thể hiện chính xác cam kết, dè dặt hoặc phản bác.',
    'Combine modal and lexical stance with accurate negation scope to express commitment, reservation, or challenge precisely.',
    [
      'stance verb + that-clause',
      'modal + perfect/progressive infinitive',
      'negated stance + embedded proposition',
    ],
    [
      'Signal degrees and sources of commitment.',
      'Distinguish denying certainty from asserting the opposite.',
    ],
    ['ADVANCED_HEDGING', 'MODAL_DEDUCTION_PRESENT_PAST'],
    'Interpret and place negation according to its intended scope; do not treat all uncertainty markers as interchangeable.',
    [
      [
        'I do not believe the evidence is conclusive.',
        'Tôi không cho rằng bằng chứng mang tính kết luận.',
      ],
      [
        'The policy may well have contributed to the decline.',
        'Chính sách rất có thể đã góp phần vào sự suy giảm.',
      ],
      [
        'She is bound to have considered the alternative.',
        'Chắc hẳn cô ấy đã cân nhắc phương án khác.',
      ],
    ],
    [
      'I believe the evidence is not conclusive, necessarily.',
      'I do not necessarily believe the evidence is conclusive.',
      'Vị trí necessarily và phủ định làm thay đổi phạm vi nghĩa.',
    ],
    {
      contextVi: 'Bạn thừa nhận khả năng khá cao nhưng không khẳng định chắc chắn.',
      sourceVi: 'Chính sách rất có thể đã góp phần vào kết quả này.',
      answers: [
        'The policy may well have contributed to this outcome.',
        'The policy is quite likely to have contributed to this outcome.',
      ],
      requirements: [
        'Express a high probability short of certainty.',
        'Use past-oriented modality.',
      ],
      vocabulary: [
        'outcome',
        'noun',
        'kết quả',
        'Kết quả cuối cùng của một quá trình hoặc sự kiện.',
        'contribute to an outcome — góp phần vào kết quả',
      ],
    },
  ),
  make(
    'COUNTERFACTUAL_MIXED_TIME',
    'COUNTERFACTUALITY',
    'C2',
    'Phản thực phức hợp qua nhiều mốc thời gian',
    'Xây dựng quan hệ phản thực có nguyên nhân và hệ quả trải qua nhiều mốc thời gian mà không mất logic.',
    'Construct counterfactual relations whose causes and consequences span multiple time frames without losing temporal logic.',
    [
      'past counterfactual cause + present/future counterfactual consequence',
      'present state condition + past counterfactual consequence',
    ],
    [
      'Trace a current consequence to an unreal past cause.',
      'Explain an unreal past outcome through a persistent present trait.',
    ],
    ['MIXED_CONDITIONAL_PAST_PRESENT', 'FUTURE_PERFECT'],
    'Each clause must use the form appropriate to its own time reference, not a mechanically matched conditional pattern.',
    [
      [
        'If the team had invested earlier, it would be leading the market now.',
        'Nếu đội ngũ đầu tư sớm hơn, giờ họ đã dẫn đầu thị trường.',
      ],
      [
        'If she were less cautious, she might have accepted the offer yesterday.',
        'Nếu cô ấy bớt thận trọng, có lẽ hôm qua cô ấy đã nhận lời.',
      ],
      [
        'Had the warning been clearer, we would not be facing this delay next week.',
        'Nếu cảnh báo rõ hơn, tuần tới chúng ta đã không phải đối mặt sự chậm trễ này.',
      ],
    ],
    [
      'If I were more careful, I would not lose it yesterday.',
      'If I were more careful, I would not have lost it yesterday.',
      'Kết quả quá khứ phản thực cần would have cộng quá khứ phân từ.',
    ],
    {
      contextVi: 'Bạn liên hệ quyết định cũ với vị thế hiện tại.',
      sourceVi: 'Nếu công ty đã thích nghi sớm hơn, giờ họ sẽ cạnh tranh tốt hơn.',
      answers: [
        'If the company had adapted earlier, it would be competing more effectively now.',
        'Had the company adapted earlier, it would be more competitive now.',
      ],
      requirements: [
        'Use a past counterfactual condition.',
        'Express a present counterfactual result.',
      ],
      vocabulary: [
        'adapt',
        'verb',
        'thích nghi',
        'Thay đổi để phù hợp với hoàn cảnh mới.',
        'adapt earlier — thích nghi sớm hơn',
      ],
    },
  ),
  make(
    'DISCOURSE_MARKERS_ARGUMENTATION',
    'DISCOURSE_COHESION',
    'C2',
    'Discourse markers trong lập luận phức hợp',
    'Dùng liên kết diễn ngôn để thể hiện chính xác nhượng bộ, giới hạn, hệ quả và chuyển hướng lập luận.',
    'Use discourse markers to signal concession, qualification, consequence, and argumentative redirection precisely.',
    [
      'admittedly + concession; nevertheless + counterclaim',
      'that said + qualification',
      'by the same token + parallel inference',
    ],
    ['Guide readers through a multi-stage argument.', 'Mark the logical status of a proposition.'],
    ['COMPLEX_PREPOSITIONAL_PHRASES', 'ADVANCED_HEDGING'],
    'A discourse marker must match the logical relation between propositions and cannot substitute for missing reasoning.',
    [
      [
        'Admittedly, the sample is small; nevertheless, the pattern is consistent.',
        'Phải thừa nhận mẫu nhỏ; tuy vậy, mô hình vẫn nhất quán.',
      ],
      [
        'The approach is efficient. That said, it is not suitable for every case.',
        'Cách tiếp cận hiệu quả. Tuy vậy, nó không phù hợp mọi trường hợp.',
      ],
      [
        'By the same token, a lower price does not guarantee better value.',
        'Tương tự theo logic đó, giá thấp hơn không đảm bảo giá trị tốt hơn.',
      ],
    ],
    [
      'The evidence is weak; consequently, the claim may still be true.',
      'The evidence is weak; nevertheless, the claim may still be true.',
      'Quan hệ ở đây là nhượng bộ, không phải hệ quả.',
    ],
    {
      contextVi: 'Bạn thừa nhận hạn chế rồi bảo vệ một kết luận thận trọng.',
      sourceVi: 'Phải thừa nhận dữ liệu còn hạn chế; tuy vậy, xu hướng đáng để nghiên cứu thêm.',
      answers: [
        'Admittedly, the data are limited; nevertheless, the trend deserves further investigation.',
        'Admittedly, the data is limited. That said, the trend warrants further study.',
      ],
      requirements: [
        'Use a concession marker and a contrasting continuation.',
        'Do not overstate the conclusion.',
      ],
      vocabulary: [
        'warrant',
        'verb',
        'xứng đáng hoặc cần đến',
        'Cung cấp đủ lý do để một hành động được thực hiện.',
        'warrant further study — đáng được nghiên cứu thêm',
      ],
    },
  ),
  make(
    'END_WEIGHT_INFORMATION_PACKAGING',
    'INFORMATION_STRUCTURE',
    'C2',
    'End-weight và đóng gói thông tin',
    'Sắp xếp cấu trúc để thành phần dài, mới hoặc phức tạp nằm cuối câu, giúp câu dễ xử lý mà không đổi nghĩa.',
    'Arrange clauses so long, new, or complex constituents occur late, improving processing without changing meaning.',
    ['anticipatory it + verb + extraposed clause', 'light subject + verb + heavy complement'],
    ['Delay a heavy clause.', 'Move from given information to new complex information.'],
    ['PSEUDO_CLEFT_NUANCE', 'FRONTING_TOPICALISATION'],
    'Extraposition must retain the semantic role of the delayed clause and avoid an ambiguous anticipatory pronoun.',
    [
      [
        'It became clear that the original estimate was unrealistic.',
        'Dần rõ rằng ước tính ban đầu không thực tế.',
      ],
      [
        'It surprised us that so few participants withdrew.',
        'Việc rất ít người tham gia rút lui khiến chúng tôi bất ngờ.',
      ],
      [
        'A question arose as to whether the evidence was admissible.',
        'Một câu hỏi nảy sinh về việc liệu bằng chứng có được chấp nhận không.',
      ],
    ],
    [
      'That the plan failed is clear to everyone now.',
      'It is now clear to everyone that the plan failed.',
      'Đưa mệnh đề dài ra cuối giúp câu cân đối hơn trong ngữ cảnh này.',
    ],
    {
      contextVi: 'Bạn viết lại câu để mệnh đề dài nằm cuối.',
      sourceVi: 'Dần trở nên rõ ràng rằng giải pháp hiện tại không thể mở rộng.',
      answers: [
        'It became clear that the current solution could not scale.',
        'It gradually became apparent that the existing solution was not scalable.',
      ],
      requirements: ['Use anticipatory it.', 'Place the heavy that-clause at the end.'],
      vocabulary: [
        'scalable',
        'adjective',
        'có khả năng mở rộng',
        'Có thể tăng quy mô mà vẫn hoạt động hiệu quả.',
        'a scalable solution — giải pháp có khả năng mở rộng',
      ],
    },
  ),
  make(
    'LITERARY_PAST_FORMS',
    'NARRATIVE_DISCOURSE',
    'C2',
    'Dạng quá khứ trong văn kể giàu phong cách',
    'Dùng past perfect, past progressive và cấu trúc dự phóng quá khứ để điều khiển điểm nhìn và nhịp kể tinh tế.',
    'Use past perfect, past progressive, and future-in-the-past forms to control viewpoint and narrative pacing.',
    ['was/were to + base verb', 'would + base verb for future in the past', 'had been + verb-ing'],
    [
      'Foreshadow a later event from a past viewpoint.',
      'Show duration leading up to a narrative moment.',
    ],
    ['NARRATIVE_TENSE_MIXING', 'FUTURE_CONTINUOUS'],
    'Future-in-the-past forms must be anchored to a past viewpoint and distinguished from habitual would.',
    [
      [
        'She did not know that the letter would change everything.',
        'Cô ấy không biết rằng lá thư sẽ thay đổi mọi thứ.',
      ],
      ['They were to meet only once more.', 'Họ rồi sẽ chỉ gặp nhau thêm một lần nữa.'],
      [
        'He had been waiting for hours when the door finally opened.',
        'Anh đã đợi nhiều giờ khi cánh cửa cuối cùng mở ra.',
      ],
    ],
    [
      'She knew the letter will change everything.',
      'She knew the letter would change everything.',
      'Từ điểm nhìn quá khứ, tương lai được biểu đạt bằng would.',
    ],
    {
      contextVi: 'Bạn báo trước một sự kiện từ điểm nhìn quá khứ.',
      sourceVi: 'Khi đó, họ không biết quyết định này sẽ thay đổi cuộc đời họ.',
      answers: [
        'At the time, they did not know that this decision would change their lives.',
        'They did not yet know that the decision would transform their lives.',
      ],
      requirements: ['Use future in the past with would.', 'Maintain a past narrative viewpoint.'],
      vocabulary: [
        'transform',
        'verb',
        'thay đổi hoàn toàn',
        'Làm cho một điều trở nên rất khác về bản chất.',
        'transform their lives — thay đổi cuộc đời họ',
      ],
    },
  ),
  make(
    'EMBEDDED_CLAUSE_COMPLEXITY',
    'CLAUSE_COMPLEXITY',
    'C2',
    'Mệnh đề lồng ghép phức hợp',
    'Quản lý nhiều tầng bổ ngữ, mệnh đề quan hệ và câu hỏi gián tiếp mà vẫn rõ phạm vi và tham chiếu.',
    'Manage layered complement, relative, and interrogative clauses while keeping scope and reference clear.',
    [
      'reporting clause + complement clause + embedded interrogative',
      'noun + relative clause + complement clause',
    ],
    [
      'Represent layered beliefs or reports.',
      'Embed an unresolved question within a larger proposition.',
    ],
    ['REPORTED_SPEECH_QUESTIONS', 'RELATIVE_CLAUSES_NON_DEFINING'],
    'Every embedded clause must have clear boundaries, complement selection, and recoverable referents.',
    [
      [
        'The report suggests that nobody knows why the system failed.',
        'Báo cáo cho thấy không ai biết vì sao hệ thống lỗi.',
      ],
      [
        'The analyst who reviewed the figures believes that demand will recover.',
        'Nhà phân tích đã rà soát số liệu tin rằng nhu cầu sẽ phục hồi.',
      ],
      [
        'What remains unclear is whether those who objected understood the proposal.',
        'Điều chưa rõ là liệu những người phản đối có hiểu đề xuất không.',
      ],
    ],
    [
      'I wonder that whether they know what happened.',
      'I wonder whether they know what happened.',
      'Wonder nhận trực tiếp whether-clause, không dùng thêm that.',
    ],
    {
      contextVi: 'Bạn trình bày một điều chưa rõ qua hai tầng mệnh đề.',
      sourceVi: 'Điều chưa rõ là liệu nhóm có biết vì sao khách hàng rời đi hay không.',
      answers: [
        'What remains unclear is whether the team knows why the customers left.',
        'It remains unclear whether the team knows why customers have left.',
      ],
      requirements: [
        'Embed a why-clause inside a whether-clause.',
        'Keep clause boundaries unambiguous.',
      ],
      vocabulary: [
        'unclear',
        'adjective',
        'chưa rõ',
        'Không đủ rõ ràng hoặc chưa được biết chắc.',
        'what remains unclear — điều vẫn chưa rõ',
      ],
    },
  ),
  make(
    'PRAGMATIC_SOFTENING_IMPLICATION',
    'PRAGMATICS',
    'C2',
    'Giảm nhẹ và hàm ý trong tương tác',
    'Dùng câu hỏi gián tiếp, understatement và điều kiện hóa để giảm áp lực hoặc tạo hàm ý phù hợp ngữ cảnh.',
    'Use indirect questions, understatement, and conditional framing to soften imposition or create context-appropriate implication.',
    [
      'I was wondering if/whether + clause',
      'it might be worth + verb-ing',
      'if you could + base verb, that would be + adjective',
    ],
    [
      'Make a high-imposition request tactfully.',
      'Offer criticism or advice without unnecessary bluntness.',
    ],
    ['ADVANCED_HEDGING', 'REPORTED_SPEECH_QUESTIONS'],
    'Softening must leave the intended request or evaluation recoverable and must not create deceptive ambiguity.',
    [
      [
        'I was wondering whether you might have time to review this.',
        'Tôi muốn hỏi liệu bạn có thời gian xem lại việc này không.',
      ],
      [
        'It might be worth reconsidering the final section.',
        'Có lẽ đáng để xem xét lại phần cuối.',
      ],
      [
        'If you could send it today, that would be extremely helpful.',
        'Nếu bạn có thể gửi hôm nay thì sẽ rất hữu ích.',
      ],
    ],
    [
      'I wonder if you send this now.',
      'I was wondering if you could send this now.',
      'Dùng past progressive và could để giảm mức áp đặt của yêu cầu.',
    ],
    {
      contextVi: 'Bạn đưa ra yêu cầu khá lớn một cách lịch sự.',
      sourceVi: 'Tôi muốn hỏi liệu bạn có thể xem lại toàn bộ báo cáo trước ngày mai không.',
      answers: [
        'I was wondering whether you could review the entire report before tomorrow.',
        'I was wondering if you might be able to review the whole report by tomorrow.',
      ],
      requirements: ['Use indirect pragmatic softening.', 'Keep the request and deadline clear.'],
      vocabulary: [
        'entire',
        'adjective',
        'toàn bộ',
        'Bao gồm mọi phần, không bỏ sót phần nào.',
        'the entire report — toàn bộ báo cáo',
      ],
    },
  ),
  make(
    'REGISTER_SHIFT_GRAMMATICAL_CHOICES',
    'REGISTER',
    'C2',
    'Chuyển register bằng lựa chọn ngữ pháp',
    'Điều chỉnh chủ động/bị động, nominalisation, contraction và cấu trúc yêu cầu theo quan hệ xã hội và thể loại.',
    'Adjust voice, nominalisation, contraction, and request structure to suit social relationship and genre.',
    [
      'informal personal clause ↔ formal impersonal/passive clause',
      'direct request ↔ modalised indirect request',
    ],
    [
      'Match grammar to formal or informal genre.',
      'Shift interpersonal distance without changing core proposition.',
    ],
    ['NOMINALISATION_FORMAL_STYLE', 'PASSIVE_ADVANCED_FORMS', 'PRAGMATIC_SOFTENING_IMPLICATION'],
    'Register shifts must preserve core meaning while making coordinated grammatical changes rather than swapping isolated vocabulary.',
    [
      [
        'Send us the files today. → We would appreciate it if the files could be sent today.',
        'Hãy gửi tệp hôm nay. → Chúng tôi rất cảm kích nếu các tệp có thể được gửi hôm nay.',
      ],
      [
        "We didn't look into it. → No investigation was undertaken.",
        'Chúng tôi không xem xét việc đó. → Không có cuộc điều tra nào được tiến hành.',
      ],
      [
        'The results are kind of odd. → The results appear somewhat anomalous.',
        'Kết quả hơi lạ. → Kết quả có vẻ phần nào bất thường.',
      ],
    ],
    [
      'Please kindly send me it ASAP in the report.',
      'Please send it as soon as possible.',
      'Trộn các dấu hiệu register không nhất quán làm yêu cầu kém tự nhiên.',
    ],
    {
      contextVi: 'Bạn chuyển một câu trực tiếp thành văn phong báo cáo trang trọng.',
      sourceVi: 'Chúng tôi đã không kiểm tra vấn đề này đủ kỹ.',
      answers: [
        'The issue was not examined sufficiently thoroughly.',
        'A sufficiently thorough examination of the issue was not conducted.',
      ],
      requirements: [
        'Use a formal impersonal or nominalised structure.',
        'Preserve the admission of insufficient examination.',
      ],
      vocabulary: [
        'thoroughly',
        'adverb',
        'một cách kỹ lưỡng',
        'Theo cách xem xét mọi phần quan trọng rất cẩn thận.',
        'examine thoroughly — kiểm tra kỹ lưỡng',
      ],
    },
  ),
  make(
    'SCOPE_AMBIGUITY_CONTROL',
    'SEMANTICS',
    'C2',
    'Kiểm soát phạm vi và mơ hồ cấu trúc',
    'Sắp xếp phủ định, lượng từ, trạng từ và mệnh đề bổ nghĩa để người đọc nhận đúng phạm vi nghĩa.',
    'Position negation, quantifiers, adverbs, and modifiers so readers recover the intended semantic scope.',
    [
      'not + all/every: partial negation',
      'all/every + not: context-sensitive scope',
      'modifier adjacent to intended head',
    ],
    [
      'Distinguish partial from total negation.',
      'Prevent attachment ambiguity in complex sentences.',
    ],
    ['MODALITY_FINE_GRAINED_STANCE', 'EMBEDDED_CLAUSE_COMPLEXITY'],
    'Choose word order or an explicit paraphrase that uniquely expresses the intended scope when ambiguity would matter.',
    [
      ['Not all participants agreed.', 'Không phải tất cả người tham gia đều đồng ý.'],
      ['None of the participants agreed.', 'Không người tham gia nào đồng ý.'],
      [
        'We interviewed the managers who had raised concerns.',
        'Chúng tôi phỏng vấn những quản lý đã nêu quan ngại.',
      ],
    ],
    [
      'All participants did not agree.',
      'Not all participants agreed.',
      'Not all diễn đạt rõ phủ định một phần; câu ban đầu dễ mơ hồ.',
    ],
    {
      contextVi: 'Bạn cần nói chỉ một số người không đồng ý, không phải tất cả.',
      sourceVi: 'Không phải tất cả thành viên đều ủng hộ đề xuất.',
      answers: [
        'Not all members supported the proposal.',
        'Not every member supported the proposal.',
      ],
      requirements: [
        'Express partial rather than total negation.',
        'Place negation before the quantifier.',
      ],
      vocabulary: [
        'support',
        'verb',
        'ủng hộ',
        'Đồng ý hoặc giúp một ý tưởng, người hay kế hoạch.',
        'support a proposal — ủng hộ đề xuất',
      ],
    },
  ),
  make(
    'CORPUS_STYLE_GRAMMATICAL_PATTERNING',
    'STYLE',
    'C2',
    'Patterning ngữ pháp và phong cách nhất quán',
    'Duy trì song song cấu trúc, nhịp mệnh đề và lựa chọn hữu hạn/phi hữu hạn trong văn bản dài.',
    'Maintain structural parallelism, clause rhythm, and finite/non-finite choices across extended prose.',
    [
      'to + verb, to + verb, and to + verb',
      'verb-ing, verb-ing, and verb-ing',
      'parallel finite clauses',
    ],
    [
      'Make coordinated ideas equally interpretable.',
      'Create deliberate rhythm without sacrificing precision.',
    ],
    ['ELLIPSIS_SUBSTITUTION', 'REGISTER_SHIFT_GRAMMATICAL_CHOICES'],
    'Coordinated elements serving the same syntactic function should use parallel structures unless a motivated contrast requires otherwise.',
    [
      [
        'The role involves planning projects, managing budgets, and mentoring staff.',
        'Vai trò gồm lập kế hoạch dự án, quản lý ngân sách và hướng dẫn nhân viên.',
      ],
      [
        'We aim to reduce waste, to improve access, and to build trust.',
        'Chúng tôi hướng tới giảm lãng phí, cải thiện tiếp cận và xây dựng niềm tin.',
      ],
      [
        'The policy is clear in purpose, limited in scope, and practical in application.',
        'Chính sách rõ về mục đích, giới hạn về phạm vi và thực tế khi áp dụng.',
      ],
    ],
    [
      'The role involves planning, to manage budgets, and staff mentoring.',
      'The role involves planning projects, managing budgets, and mentoring staff.',
      'Các thành phần phối hợp cần có cấu trúc song song.',
    ],
    {
      contextVi: 'Bạn viết ba mục tiêu song song trong một tuyên bố.',
      sourceVi: 'Chúng tôi muốn giảm chi phí, cải thiện chất lượng và xây dựng lòng tin.',
      answers: [
        'We aim to reduce costs, improve quality, and build trust.',
        'We want to reduce costs, to improve quality, and to build trust.',
      ],
      requirements: ['Use three parallel verb phrases.', 'Preserve all three goals.'],
      vocabulary: [
        'trust',
        'noun',
        'lòng tin',
        'Niềm tin rằng một người hoặc tổ chức đáng tin cậy.',
        'build trust — xây dựng lòng tin',
      ],
    },
  ),
];
