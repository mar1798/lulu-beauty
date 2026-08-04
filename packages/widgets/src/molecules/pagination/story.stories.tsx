import type { StoryFn, Meta } from '@storybook/react'
import { useState } from 'react'
import { Pagination } from '.'
import { feedPagination } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Molecules/Pagination',
  component: Pagination,
} satisfies Meta<typeof Pagination>

/** Стори держит состояние сама: контрол управляемый. */
const Template: StoryFn<typeof Pagination> = args => {
  const [page, setPage] = useState(args.page)

  return (
    <StoryWrapper>
      <Pagination {...args} page={page} onChange={setPage} />
    </StoryWrapper>
  )
}

export const Default = Template.bind({})
Default.parameters = {
  layout: 'centered',
}
Default.args = feedPagination()
