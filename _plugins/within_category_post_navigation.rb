module Jekyll
  class WithinCategoryPostNavigation < Generator
    def generate(site)
      site.categories.each_pair do |category, posts|
        posts.sort! { |a,b| a <=> b}
        posts.each_with_index do |post, index|
          next_in_category = nil
          previous_in_category = nil
          if index < posts.length - 1
            next_in_category = posts[index + 1]
          end
          if index > 0
            previous_in_category = posts[index - 1]
          end
          post.data["next_in_category"] = next_in_category unless next_in_category.nil?
          post.data["previous_in_category"] = previous_in_category unless previous_in_category.nil?
        end
      end
    end
  end
end
